import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import {
  readCache,
  readLlmHistory,
  writeCache,
  writeLlmHistory,
} from "@/lib/cache";
import {
  applyDeltas,
  pickBaseline,
  snapshotFromItems,
  updateHistory,
} from "@/lib/llmHistory";
import { backfillArticleSummaries, generateDailyBrief } from "@/lib/brief";

export const maxDuration = 60; // Hobby-tier max for cron-invoked functions
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const blob = await runPipeline();
    const anySuccess = Object.values(blob.tabs).some((t) =>
      t.sources.some((s) => s.ok)
    );
    // Keep the last good cache rather than overwriting with an empty run.
    if (!anySuccess) {
      const prev = await readCache();
      if (prev) {
        return NextResponse.json(
          { status: "kept-last-good", reason: "all sources failed" },
          { status: 200 }
        );
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

    // Gemini enrichment (daily brief + summaries for bare articles), in
    // parallel and fail-soft: a quota error or timeout never blocks the cache.
    const [briefRes, summaryRes] = await Promise.allSettled([
      generateDailyBrief(blob),
      backfillArticleSummaries(blob),
    ]);
    if (briefRes.status === "fulfilled" && briefRes.value) {
      blob.brief = { bullets: briefRes.value };
      console.log(`[refresh] brief: ok (${briefRes.value.length} bullets)`);
    } else {
      console.log(
        `[refresh] brief: skipped — ${
          briefRes.status === "rejected" ? briefRes.reason : "no key or empty"
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
    return NextResponse.json({
      status: "ok",
      generatedAt: blob.generatedAt,
      tabs: Object.fromEntries(
        Object.entries(blob.tabs).map(([k, v]) => [
          k,
          { items: v.items.length, sources: v.sources },
        ])
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: String((e as Error).message) },
      { status: 500 }
    );
  }
}
