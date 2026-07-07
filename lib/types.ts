export type ItemType = "paper" | "model" | "llm" | "article" | "discussion";

export interface Signal {
  source: string; // e.g. "hf", "hn", "reddit", "alphaxiv", "pwc"
  metric: string; // e.g. "upvotes", "points", "comments"
  value: number;
}

export interface Item {
  id: string; // stable per-type dedup key (arXiv ID, normalized URL, reddit permalink)
  type: ItemType;
  title: string;
  url: string;
  authorsOrSource: string;
  summary: string;
  firstSeenDate: string; // ISO date
  signals: Signal[];
  tractionScore: number;
  tags: string[];
}

// What adapters emit: an Item minus the computed score (filled in by the pipeline).
export type RawItem = Omit<Item, "tractionScore">;

export interface AdapterResult {
  source: string;
  items: RawItem[];
}

// Every adapter fetches one source and returns partial items. Adapters must never
// throw — the pipeline wraps them, but they should also fail soft internally.
export type Adapter = () => Promise<AdapterResult>;

export interface TabResult {
  items: Item[];
  sources: { source: string; ok: boolean; count: number; error?: string }[];
}

export interface CachedBlob {
  generatedAt: string;
  tabs: Partial<Record<ItemType, TabResult>>;
  // Age (days) of the LLM leaderboard baseline the delta signals compare
  // against; absent until a second day of history exists.
  llmDeltaDays?: number;
  // Gemini-written "what happened" bullets, generated once per refresh;
  // absent when GEMINI_API_KEY is missing or the call failed.
  brief?: { bullets: string[] };
}
