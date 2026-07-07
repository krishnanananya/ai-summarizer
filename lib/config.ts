import type { ItemType } from "./types";

export interface TabConfig {
  enabled: boolean;
  // Fetch and cache the data (pipeline runs, Today digest and the chat
  // prompt see it) but show no dedicated tab in the nav.
  hiddenInUi?: boolean;
  windowDays: number;
  // Weight per "source:metric" signal when summing normalized values.
  weights: Record<string, number>;
  // Bonus added per extra distinct source an item appears on.
  corroborationBonus: number;
  // News-style tabs only: score halves every this many days, so a longer
  // window doesn't leave one megastory pinned at #1 all week.
  decayHalfLifeDays?: number;
  // Leaderboard tabs: normalize (v-min)/(max-min) instead of v/max, so
  // clustered absolute values (e.g. Elo ratings) still spread the bars.
  minMaxNormalize?: boolean;
  label: string;
}

// Single top-level config. Flip `enabled: false` on any tab to kill it —
// the pipeline skips its adapters and the UI hides the tab.
export const CONFIG: Record<ItemType, TabConfig> = {
  paper: {
    enabled: true,
    windowDays: 21,
    weights: {
      "hf:upvotes": 1.0,
      "hf:comments": 0.3,
      "reddit:score": 0.7,
      "reddit:comments": 0.4,
    },
    corroborationBonus: 0.25,
    // Without decay a megapaper pins #1 for the whole 21-day window; a
    // 7-day half-life keeps daily visits from seeing the same top list.
    decayHalfLifeDays: 7,
    label: "Papers",
  },
  model: {
    enabled: true,
    hiddenInUi: true, // no nav tab, but Today's Releases + chat still get the data
    windowDays: 14,
    weights: {
      "hf:likes": 1.0,
      "hf:downloads": 0.6,
      "github:stars": 1.0,
    },
    corroborationBonus: 0.25,
    label: "Models",
  },
  llm: {
    enabled: true,
    // A standing leaderboard, not a news window — entries carry the fetch
    // date, so any positive window works; keep it wide and hide the filter.
    // Ranking/display is handled by the LlmBoard component (per-benchmark
    // signal order), so these weights only produce a nominal tractionScore.
    windowDays: 3650,
    weights: {
      "arena:elo": 1.0,
      "arena:score": 1.0,
    },
    corroborationBonus: 0,
    minMaxNormalize: true,
    label: "LLMs",
  },
  article: {
    enabled: true,
    // 8 days, not 5: major lab announcements (e.g. a frontier model launch)
    // routinely stay "the news" for a week; decay below handles staleness.
    windowDays: 8,
    weights: {
      "hn:points": 1.0,
      "hn:comments": 0.5,
      "reddit:score": 0.8,
      "reddit:comments": 0.4,
      // RSS is a presence guarantee, not traction: a small baseline so
      // official announcements always appear even with zero aggregator pickup.
      "rss:official": 0.15,
    },
    corroborationBonus: 0.25,
    decayHalfLifeDays: 4,
    label: "Articles",
  },
  discussion: {
    enabled: true, // least-validated tab: set to false to disable entirely
    windowDays: 7,
    weights: {
      "reddit:score": 1.0,
      "reddit:comments": 0.6,
    },
    corroborationBonus: 0,
    decayHalfLifeDays: 3,
    label: "Discussion",
  },
};

export const ENABLED_TYPES = (Object.keys(CONFIG) as ItemType[]).filter(
  (t) => CONFIG[t].enabled
);
