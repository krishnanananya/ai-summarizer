import type { CachedBlob, Item, ItemType } from "./types";

// Refresh-time Gemini enrichment: a daily "what happened" brief plus
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
  const summary = it.summary.replace(/\s+/g, " ").slice(0, 160);
  return `- ${it.title} (${it.firstSeenDate.slice(0, 10)}${
    top ? `, ${top.value} ${top.source} ${top.metric}` : ""
  })${summary ? ` — ${summary}` : ""}`;
}

const BRIEF_BUDGET: Partial<Record<ItemType, number>> = {
  article: 10,
  paper: 8,
  model: 5,
  discussion: 5,
};

export async function generateDailyBrief(
  blob: CachedBlob
): Promise<string[] | null> {
  const sections: string[] = [];
  for (const [type, budget] of Object.entries(BRIEF_BUDGET)) {
    const items = blob.tabs[type as ItemType]?.items?.slice(0, budget);
    if (items?.length)
      sections.push(`## ${type}\n${items.map(itemLine).join("\n")}`);
  }
  if (sections.length === 0) return null;

  const text = await gemini(
    [
      "You write the morning brief for an AI-industry professional who checks in once a day. Below are today's top-traction AI items from trackers (papers, model releases, news, discussions), each with its strongest traction signal.",
      "Write 4-6 bullets covering what actually matters most across ALL kinds — the day's headline story first. One line each, under 28 words, concrete names (labs, models, papers), neutral tone, no hype.",
      "Group related items into one bullet (a launch plus its discussion is one story). Plain text only: each line starts with '- ', no markdown bold/headings, no preamble or sign-off.",
      "",
      sections.join("\n\n"),
    ].join("\n"),
    false
  );
  if (!text) return null;

  const bullets = text
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 10)
    .slice(0, 6);
  return bullets.length >= 2 ? bullets : null;
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
