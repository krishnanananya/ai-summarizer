import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import {
  acquireRefreshLock,
  readCache,
  readLlmHistory,
  releaseRefreshLock,
  writeCache,
  writeLlmHistory,
} from "@/lib/cache";
import {
  applyDeltas,
  pickBaseline,
  snapshotFromItems,
  updateHistory,
} from "@/lib/llmHistory";
import { backfillArticleSummaries, generateDigest } from "@/lib/brief";

export const maxDuration = 60; // Hobby-tier max for cron-invoked functions
export const dynamic = "force-dynamic";

// The in-app refresh button may retrigger at most this often; the cron GET
// (authenticated) bypasses it.
const USER_REFRESH_MIN_AGE_MS = 30 * 60_000;

async function runRefresh() {
  const blob = await runPipeline();
  const anySuccess = Object.values(blob.tabs).some((t) =>
    t.sources.some((s) => s.ok)
  );
  // Keep the last good cache rather than overwriting with an empty run.
  if (!anySuccess) {
    const prev = await readCache();
    if (prev) {
      return { status: "kept-last-good", reason: "all sources failed" };
    }
  }
  // LLM movement: snapshot today's boards, diff against ~a week ago.
  const llm = blob.tabs.llm;
  if (llm && llm.items.length > 0) {
    try {
      const today = blob.generatedAt.slice(0, 10);
      const history = await readLlmHistory();
      const base = pickBaseline(history, today);
      if (base) {
        applyDeltas(llm.items, base);
        blob.llmDeltaDays = Math.round(
          (new Date(today).getTime() - new Date(base.date).getTime()) /
            86400_000
        );
      }
      await writeLlmHistory(
        updateHistory(history, snapshotFromItems(llm.items, today))
      );
    } catch (e) {
      console.log(`[refresh] llm-history FAILED — ${(e as Error).message}`);
    }
  }

  // Gemini enrichment (ranked story digest + summaries for bare articles),
  // in parallel and fail-soft: a quota error or timeout never blocks the
  // cache — the Today tab just falls back to its tile grid.
  const [digestRes, summaryRes] = await Promise.allSettled([
    generateDigest(blob),
    backfillArticleSummaries(blob),
  ]);
  if (digestRes.status === "fulfilled" && digestRes.value) {
    blob.digest = { stories: digestRes.value };
    console.log(`[refresh] digest: ok (${digestRes.value.length} stories)`);
  } else {
    console.log(
      `[refresh] digest: skipped — ${
        digestRes.status === "rejected" ? digestRes.reason : "no key or empty"
      }`
    );
  }
  console.log(
    `[refresh] summaries: ${
      summaryRes.status === "fulfilled"
        ? `${summaryRes.value} filled`
        : `FAILED — ${summaryRes.reason}`
    }`
  );

  await writeCache(blob);
  return {
    status: "ok",
    generatedAt: blob.generatedAt,
    tabs: Object.fromEntries(
      Object.entries(blob.tabs).map(([k, v]) => [
        k,
        { items: v.items.length, sources: v.sources },
      ])
    ),
  };
}

// Cron / operator path: full run, whenever asked, secret required.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runRefresh());
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: String((e as Error).message) },
      { status: 500 }
    );
  }
}

// In-app refresh button: no secret (the browser can't hold one), so it is
// debounced — a no-op while the cache is under 30 minutes old — and locked
// against concurrent runs. Worst-case cost to an abuser is one pipeline run
// per half hour, all free-tier sources.
export async function POST() {
  try {
    const prev = await readCache();
    const age = prev
      ? Date.now() - new Date(prev.generatedAt).getTime()
      : Infinity;
    if (age < USER_REFRESH_MIN_AGE_MS) {
      return NextResponse.json({
        status: "fresh",
        generatedAt: prev!.generatedAt,
      });
    }
    if (!(await acquireRefreshLock())) {
      return NextResponse.json({ status: "already-running" });
    }
    try {
      return NextResponse.json(await runRefresh());
    } finally {
      await releaseRefreshLock();
    }
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: String((e as Error).message) },
      { status: 500 }
    );
  }
}
