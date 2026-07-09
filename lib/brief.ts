import type { CachedBlob, DigestStory, Item, ItemType } from "./types";
import { isWatchlisted, labMatch } from "./editorial";

// Refresh-time Gemini enrichment: a ranked story digest (lead first) plus
// one-line summaries for the summary-less HN/RSS articles. Both are
// fail-soft — no key, a timeout, or unparseable output just skips the
// feature for this run. Two non-streaming calls per day, far inside the
// free tier the chat already budgets for.

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const CALL_TIMEOUT_MS = 15_000; // refresh runs under a 60s function cap

async function gemini(prompt: string, json: boolean): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          // Speed over depth: these are summarization calls, not reasoning.
          thinkingConfig: { thinkingBudget: 0 },
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    console.log(`[brief] gemini ${res.status} — ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  return text || null;
}

function itemLine(it: Item): string {
  const top = it.signals
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  const lab = labMatch(it);
  const flags = `${lab ? ` [${lab.label}]` : ""}${
    isWatchlisted(it) ? " [WATCHLIST]" : ""
  }`;
  const summary = it.summary.replace(/\s+/g, " ").slice(0, 160);
  return `id=${it.id} [${it.type}]${flags} ${it.title} (${it.firstSeenDate.slice(0, 10)}${
    top ? `, ${top.value} ${top.source} ${top.metric}` : ""
  })${summary ? ` — ${summary}` : ""}`;
}

// Traction-ranked candidates per tab…
const DIGEST_BUDGET: Partial<Record<ItemType, number>> = {
  article: 12,
  paper: 10,
  model: 6,
  discussion: 6,
};
// …plus every recent watchlist hit that traction alone would have missed.
// A release announced hours ago has no points yet; force its candidacy.
const WATCHLIST_WINDOW_MS = 3 * 86400_000;
const WATCHLIST_EXTRA_CAP = 10;

function digestCandidates(blob: CachedBlob): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  const add = (it: Item) => {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      out.push(it);
    }
  };
  for (const [type, budget] of Object.entries(DIGEST_BUDGET)) {
    const items = blob.tabs[type as ItemType]?.items ?? [];
    items.slice(0, budget).forEach(add);
    items
      .slice(budget)
      .filter(
        (it) =>
          isWatchlisted(it) &&
          Date.now() - new Date(it.firstSeenDate).getTime() <
            WATCHLIST_WINDOW_MS
      )
      .slice(0, WATCHLIST_EXTRA_CAP)
      .forEach(add);
  }
  return out;
}

export async function generateDigest(
  blob: CachedBlob
): Promise<DigestStory[] | null> {
  const candidates = digestCandidates(blob);
  if (candidates.length === 0) return null;
  const validIds = new Set(candidates.map((it) => it.id));

  const text = await gemini(
    [
      "You are the editor of a morning brief for an AI-industry professional who checks in once a day. Below are candidate items from trackers (news articles, papers, model releases, discussions), each with an id, kind, traction signal, and flags.",
      "Select and rank the 5-6 stories that matter most, most important first — the first story is the lead.",
      "Editorial priority, in order:",
      "1. New model/product releases and major announcements from frontier labs — OpenAI, Anthropic, Google/DeepMind, Meta, xAI, DeepSeek, Qwen/Alibaba, Mistral. Items flagged [WATCHLIST] are watchlist hits: include each as a story unless it is clearly minor (a small fine-tune, a quantized re-upload, incremental docs). A same-day multi-model release from a frontier lab is the lead unless something bigger happened. Low traction on a watchlist item does NOT make it minor — it may simply be hours old.",
      "2. Major AI policy, regulation, safety, or legal news.",
      "3. Benchmark or leaderboard shake-ups and standout research papers.",
      "4. Hardware/infrastructure, funding, and industry drama only when traction is very high.",
      "Group every item about the same story into ONE story (a launch article + the model weights + its discussion thread = one story, list all their ids). Do not pad: if only 4 stories matter, return 4.",
      "For each story write: headline — under 12 words, concrete, neutral, no hype; why — one sentence (under 25 words) on why it matters to someone working in AI.",
      'Return ONLY JSON: {"stories":[{"headline":"...","why":"...","ids":["<id>", ...]}, ...]} with ids copied exactly from the candidates.',
      "",
      candidates.map(itemLine).join("\n"),
    ].join("\n"),
    true
  );
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { stories?: DigestStory[] };
    const stories = (parsed.stories ?? [])
      .map((s) => ({
        headline: String(s.headline ?? "").trim(),
        why: String(s.why ?? "").trim(),
        ids: (Array.isArray(s.ids) ? s.ids : []).filter((id) =>
          validIds.has(String(id))
        ),
      }))
      .filter((s) => s.headline.length > 5 && s.ids.length > 0)
      .slice(0, 6);
    return stories.length >= 2 ? stories : null;
  } catch {
    console.log("[brief] digest returned unparseable JSON");
    return null;
  }
}

// Fill in one-sentence summaries for top articles that have none (HN and
// some RSS entries are title-only). Mutates the blob's items in place.
export async function backfillArticleSummaries(blob: CachedBlob): Promise<number> {
  const bare = (blob.tabs.article?.items ?? [])
    .filter((it) => it.summary.trim().length < 40)
    .slice(0, 40);
  if (bare.length === 0) return 0;

  const text = await gemini(
    [
      "For each AI-news item below, write one neutral sentence (max 22 words) saying what it is or why it matters, from the title, source, and your own knowledge. If the title already says it all or you are unsure, plainly restate it — never speculate or invent specifics.",
      'Return ONLY a JSON object mapping id to sentence: {"<id>": "<sentence>", ...}.',
      "",
      ...bare.map((it) => `id: ${it.id}\ntitle: ${it.title}\nsource: ${it.authorsOrSource}\n`),
    ].join("\n"),
    true
  );
  if (!text) return 0;

  let map: Record<string, unknown>;
  try {
    map = JSON.parse(text);
  } catch {
    console.log("[brief] summary backfill returned unparseable JSON");
    return 0;
  }
  let filled = 0;
  for (const it of bare) {
    const s = map[it.id];
    if (typeof s === "string" && s.trim().length > 10) {
      it.summary = s.trim();
      filled++;
    }
  }
  return filled;
}
