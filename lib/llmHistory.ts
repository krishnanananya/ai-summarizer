import type { Item } from "./types";

// Rolling history of LMArena snapshots so the LLM table can show movement
// ("what changed"), not just standings. One compact snapshot per refresh
// day; deltas are computed at refresh time against the snapshot closest to
// TARGET_DAYS old and baked into the cached items as extra signals:
//   arena:deltaValue — Elo (or agent-score) change since the baseline
//   arena:deltaRank  — board-rank change since the baseline (positive = up)
// Models absent from the baseline board get a "debut" tag instead.

export interface LlmSnapshot {
  date: string; // YYYY-MM-DD
  // board key -> model title (lowercased) -> value + rank on that board
  boards: Record<string, Record<string, { v: number; r: number }>>;
}

const MAX_SNAPSHOTS = 15;
const TARGET_DAYS = 7;

export const DELTA_VALUE = "deltaValue";
export const DELTA_RANK = "deltaRank";
export const DEBUT_TAG = "debut";

function boardOf(it: Item): string | undefined {
  return it.tags.find((t) => t !== DEBUT_TAG);
}

function value(it: Item): number {
  return it.signals.find((s) => s.metric === "elo" || s.metric === "score")
    ?.value ?? 0;
}

export function snapshotFromItems(items: Item[], date: string): LlmSnapshot {
  const boards: LlmSnapshot["boards"] = {};
  const byBoard = new Map<string, Item[]>();
  for (const it of items) {
    const b = boardOf(it);
    if (!b) continue;
    (byBoard.get(b) ?? byBoard.set(b, []).get(b)!).push(it);
  }
  for (const [b, list] of byBoard) {
    boards[b] = {};
    list
      .slice()
      .sort((x, y) => value(y) - value(x))
      .forEach((it, i) => {
        boards[b][it.title.trim().toLowerCase()] = { v: value(it), r: i + 1 };
      });
  }
  return { date, boards };
}

/** Upsert today's snapshot (same-date refreshes overwrite) and trim. */
export function updateHistory(
  history: LlmSnapshot[],
  snap: LlmSnapshot
): LlmSnapshot[] {
  return [...history.filter((s) => s.date !== snap.date), snap]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400_000
  );
}

/** The past snapshot whose age is closest to TARGET_DAYS (at least 1 day). */
export function pickBaseline(
  history: LlmSnapshot[],
  today: string
): LlmSnapshot | null {
  let best: LlmSnapshot | null = null;
  let bestDist = Infinity;
  for (const s of history) {
    const age = daysBetween(s.date, today);
    if (age < 1) continue;
    const dist = Math.abs(age - TARGET_DAYS);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

/** Mutates items: appends delta signals / debut tags vs the baseline. */
export function applyDeltas(items: Item[], base: LlmSnapshot): void {
  for (const it of items) {
    const b = boardOf(it);
    const prev = b ? base.boards[b]?.[it.title.trim().toLowerCase()] : null;
    const board = b ? base.boards[b] : null;
    if (!board) continue; // board itself wasn't captured — no verdict
    if (!prev) {
      if (!it.tags.includes(DEBUT_TAG)) it.tags.push(DEBUT_TAG);
      continue;
    }
    const dv = Math.round((value(it) - prev.v) * 10) / 10;
    it.signals.push({ source: "arena", metric: DELTA_VALUE, value: dv });
    // Current rank is recomputed by the UI; store the baseline rank so the
    // client can diff against whatever filtered rank it displays.
    it.signals.push({ source: "arena", metric: DELTA_RANK, value: prev.r });
  }
}
