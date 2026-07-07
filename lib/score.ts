import type { Item, ItemType, RawItem } from "./types";
import { CONFIG } from "./config";

// Per-tab scoring: normalize each signal 0–1 against the max of that
// source:metric WITHIN the same type, weighted-sum per config, plus a
// corroboration bonus per extra distinct source. Newness is only a tiebreaker.
export function scoreItems(type: ItemType, raw: RawItem[]): Item[] {
  const cfg = CONFIG[type];
  const cutoff = Date.now() - cfg.windowDays * 86400_000;
  const inWindow = raw.filter(
    (it) => new Date(it.firstSeenDate).getTime() >= cutoff
  );

  // Min/max value per source:metric across the whole tab.
  const maxes = new Map<string, number>();
  const mins = new Map<string, number>();
  for (const it of inWindow) {
    for (const s of it.signals) {
      const key = `${s.source}:${s.metric}`;
      maxes.set(key, Math.max(maxes.get(key) ?? 0, s.value));
      mins.set(key, Math.min(mins.get(key) ?? Infinity, s.value));
    }
  }

  const scored: Item[] = inWindow.map((it) => {
    let score = 0;
    for (const s of it.signals) {
      const key = `${s.source}:${s.metric}`;
      const max = maxes.get(key) ?? 0;
      if (max <= 0) continue;
      const min = cfg.minMaxNormalize ? (mins.get(key) ?? 0) : 0;
      const norm = max > min ? (s.value - min) / (max - min) : 1;
      score += (cfg.weights[key] ?? 0.5) * norm;
    }
    const distinctSources = new Set(it.signals.map((s) => s.source)).size;
    score += cfg.corroborationBonus * Math.max(0, distinctSources - 1);
    if (cfg.decayHalfLifeDays) {
      const ageDays =
        (Date.now() - new Date(it.firstSeenDate).getTime()) / 86400_000;
      score *= Math.pow(0.5, Math.max(0, ageDays) / cfg.decayHalfLifeDays);
    }
    return { ...it, tractionScore: Math.round(score * 1000) / 1000 };
  });

  const EPSILON = 0.02;
  scored.sort((a, b) => {
    if (Math.abs(a.tractionScore - b.tractionScore) > EPSILON)
      return b.tractionScore - a.tractionScore;
    return (
      new Date(b.firstSeenDate).getTime() - new Date(a.firstSeenDate).getTime()
    );
  });
  return scored;
}
