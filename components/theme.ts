import type { ItemType } from "@/lib/types";

// Frontier-lab shortcuts: one tap filters the current lane to a company's
// models, papers, and coverage. The list lives in lib/editorial.ts because
// the server-side digest watchlist uses the same regexes.
export { LABS } from "@/lib/editorial";

// One-accent system: sources render as underlined mono words in the signal
// row, not colored chips. Per-type color survives only as the lane dots
// (classes defined in globals.css for both themes).
export const SOURCE_LABEL: Record<string, string> = {
  hf: "HF",
  hn: "HN",
  github: "GITHUB",
  reddit: "REDDIT",
  rss: "BLOG",
};

const SOURCE_PRIORITY = ["hf", "hn", "github", "reddit", "rss"];

export function primarySource(sources: string[]): string {
  for (const s of SOURCE_PRIORITY) if (sources.includes(s)) return s;
  return sources[0] ?? "";
}

export const LANE_DOT: Record<ItemType, string> = {
  paper: "lane-paper",
  model: "lane-model",
  llm: "lane-llm",
  article: "lane-article",
  discussion: "lane-discussion",
};

// Short instrument names for the Feeds lane strip.
export const LANE_LABEL: Record<ItemType, string> = {
  paper: "PAPERS",
  model: "MODELS",
  llm: "LLMS",
  article: "NEWS",
  discussion: "TALK",
};
