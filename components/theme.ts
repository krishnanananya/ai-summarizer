import type { ItemType } from "@/lib/types";

// Per-type accent used consistently in tab bar, traction bars, and chips.
// Full literal class strings so Tailwind's compiler picks them up.
export const TYPE_THEME: Record<
  ItemType,
  { text: string; softBg: string; bar: string }
> = {
  paper: {
    text: "text-indigo-600 dark:text-indigo-400",
    softBg: "bg-indigo-500/10",
    bar: "bg-indigo-500",
  },
  model: {
    text: "text-emerald-600 dark:text-emerald-400",
    softBg: "bg-emerald-500/10",
    bar: "bg-emerald-500",
  },
  llm: {
    text: "text-cyan-600 dark:text-cyan-400",
    softBg: "bg-cyan-500/10",
    bar: "bg-cyan-500",
  },
  article: {
    text: "text-amber-600 dark:text-amber-400",
    softBg: "bg-amber-500/10",
    bar: "bg-amber-500",
  },
  discussion: {
    text: "text-rose-600 dark:text-rose-400",
    softBg: "bg-rose-500/10",
    bar: "bg-rose-500",
  },
};

// The cross-type "Today" briefing tab shares the same shape.
export const BRIEF_THEME = {
  text: "text-violet-600 dark:text-violet-400",
  softBg: "bg-violet-500/10",
  bar: "bg-violet-500",
};
export const BRIEF_ACCENT = "#8b5cf6";

// The Gemini-backed chat tab.
export const CHAT_THEME = {
  text: "text-fuchsia-600 dark:text-fuchsia-400",
  softBg: "bg-fuchsia-500/10",
  bar: "bg-fuchsia-500",
};
export const CHAT_ACCENT = "#d946ef";

// Hex twins of the accent hues above, for canvas drawing (GalaxyBackground).
export const TYPE_ACCENT: Record<ItemType, string> = {
  paper: "#6366f1",
  model: "#10b981",
  llm: "#06b6d4",
  article: "#f59e0b",
  discussion: "#f43f5e",
};

// Frontier-lab shortcuts: one tap filters the current tab to a company's
// models, papers, and coverage. The list lives in lib/editorial.ts because
// the server-side digest watchlist uses the same regexes.
export { LABS } from "@/lib/editorial";

// Brand-ish hues per traction source, for scannable "where is this trending".
export const SOURCE_THEME: Record<string, { label: string; chip: string }> = {
  hf: {
    label: "HF",
    chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  hn: {
    label: "HN",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  },
  github: {
    label: "GitHub",
    chip: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  },
  reddit: {
    label: "Reddit",
    chip: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
  rss: {
    label: "Blog",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
};

const SOURCE_PRIORITY = ["hf", "hn", "github", "reddit", "rss"];

export function primarySource(sources: string[]): string {
  for (const s of SOURCE_PRIORITY) if (sources.includes(s)) return s;
  return sources[0] ?? "";
}
