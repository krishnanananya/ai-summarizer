"use client";

import { Fragment, useMemo, useState } from "react";
import type { Item } from "@/lib/types";

// Coinglass-style matrix for the LLMs tab: one row per model, one column per
// arena board, sortable by clicking a column header. Items arrive one per
// (model, board) tagged with the board key; rows are grouped by model name.
// Ranks per board come from the unfiltered tab so search/lab filters never
// renumber anything.
const BOARDS = [
  { key: "text", label: "Text" },
  { key: "code", label: "Code" },
  { key: "vision", label: "Vision" },
  { key: "agent", label: "Agent" },
  { key: "search", label: "Search" },
];

// Podium ranks glow in the accent; movement up is accent, down is alert.
const MEDALS = [
  "text-[var(--acc)]",
  "text-[var(--text)] opacity-70",
  "text-[var(--acc)] opacity-60",
];
const UP = "text-[var(--acc)]";
const DOWN = "text-[var(--alert)]";

function boardValue(it: Item): number {
  return (
    it.signals.find((s) => s.metric === "elo" || s.metric === "score")?.value ??
    0
  );
}

function signalOf(it: Item, metric: string): number | undefined {
  return it.signals.find((s) => s.metric === metric)?.value;
}

function fmtDelta(d: number): string {
  return d > 0 ? `+${d}` : String(d);
}

interface ModelRow {
  key: string; // normalized title
  title: string;
  org: string;
  url: string;
  summary: string;
  ids: string[]; // item ids, for filter visibility
  values: Map<string, number>; // board key -> value
  ranks: Map<string, number>; // board key -> rank on that board
  // Movement vs the refresh-time baseline (~a week back), when history exists.
  deltas: Map<string, number>; // board key -> value change
  prevRanks: Map<string, number>; // board key -> rank at the baseline
  debuts: Set<string>; // boards this model wasn't on at the baseline
}

function buildRows(allItems: Item[]): { rows: ModelRow[]; sizes: Map<string, number> } {
  const byModel = new Map<string, ModelRow>();
  for (const it of allItems) {
    const key = it.title.trim().toLowerCase();
    let row = byModel.get(key);
    if (!row) {
      row = {
        key,
        title: it.title,
        org: it.authorsOrSource,
        url: it.url,
        summary: it.summary,
        ids: [],
        values: new Map(),
        ranks: new Map(),
        deltas: new Map(),
        prevRanks: new Map(),
        debuts: new Set(),
      };
      byModel.set(key, row);
    }
    row.ids.push(it.id);
    // Richest metadata wins (elo boards carry pricing/context, agent doesn't).
    if (it.summary.length > row.summary.length) row.summary = it.summary;
    // Prefer a model page over the arena leaderboard fallback URL.
    if (row.url.includes("arena.ai") && it.url && !it.url.includes("arena.ai"))
      row.url = it.url;
    const board = it.tags.find((t) => BOARDS.some((b) => b.key === t));
    if (board) {
      row.values.set(board, boardValue(it));
      const dv = signalOf(it, "deltaValue");
      if (dv != null) row.deltas.set(board, dv);
      const pr = signalOf(it, "deltaRank");
      if (pr != null) row.prevRanks.set(board, pr);
      if (it.tags.includes("debut")) row.debuts.add(board);
    }
  }

  // Per-board ranks + board sizes, over the full tab.
  const sizes = new Map<string, number>();
  for (const b of BOARDS) {
    const onBoard = [...byModel.values()]
      .filter((r) => r.values.has(b.key))
      .sort((x, y) => (y.values.get(b.key) ?? 0) - (x.values.get(b.key) ?? 0));
    sizes.set(b.key, onBoard.length);
    onBoard.forEach((r, i) => r.ranks.set(b.key, i + 1));
  }
  return { rows: [...byModel.values()], sizes };
}

export default function LlmBoard({
  items,
  allItems,
  deltaDays,
}: {
  items: Item[]; // after search/lab filters
  allItems: Item[]; // full tab, for true ranks
  deltaDays: number | null; // baseline age for the movement column
}) {
  const [sortKey, setSortKey] = useState("text");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { rows: modelRows, sizes } = useMemo(() => buildRows(allItems), [allItems]);

  const boards = useMemo(
    () => BOARDS.filter((b) => (sizes.get(b.key) ?? 0) > 0),
    [sizes]
  );
  const activeSort = boards.some((b) => b.key === sortKey)
    ? sortKey
    : boards[0]?.key;

  const visibleIds = useMemo(() => new Set(items.map((it) => it.id)), [items]);

  const rows = useMemo(() => {
    if (!activeSort) return [];
    return modelRows
      .filter((r) => r.ids.some((id) => visibleIds.has(id)))
      .sort((a, b) => {
        const av = a.values.get(activeSort);
        const bv = b.values.get(activeSort);
        if (av == null && bv == null)
          return (b.values.size - a.values.size) || a.title.localeCompare(b.title);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
  }, [modelRows, visibleIds, activeSort]);

  if (!activeSort) return null;

  return (
    <div className="mt-2">
      {rows.length === 0 && (
        <p className="py-10 text-center text-sm text-[var(--mut)]">
          Nothing matches.
        </p>
      )}

      {rows.length > 0 && (
        <div className="card-in overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="sticky left-0 z-10 bg-[var(--panel)] py-2 pl-3.5 pr-2 font-mono text-[9.5px] tracking-[0.14em] text-[var(--mut)]">
                    Model
                  </th>
                  {boards.map((b) => {
                    const on = b.key === activeSort;
                    return (
                      <th key={b.key} className="px-1 py-1">
                        <button
                          onClick={() => setSortKey(b.key)}
                          className={`w-full rounded-lg px-2 py-1 text-right font-mono text-[9.5px] tracking-[0.1em] transition-colors ${
                            on
                              ? "font-bold text-[var(--acc)]"
                              : "text-[var(--mut)]"
                          }`}
                        >
                          {b.label}
                          <span className={`ml-0.5 ${on ? "" : "opacity-0"}`}>↓</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r) => {
                  const rank = r.ranks.get(activeSort);
                  const expanded = expandedKey === r.key;
                  const prevRank = r.prevRanks.get(activeSort);
                  const move =
                    rank != null && prevRank != null ? prevRank - rank : 0;
                  return (
                    <Fragment key={r.key}>
                      <tr
                        onClick={() =>
                          setExpandedKey(expanded ? null : r.key)
                        }
                        className="cursor-pointer transition-colors active:bg-[var(--acc-dim)]"
                      >
                        <td className="sticky left-0 z-10 max-w-[46vw] bg-[var(--panel)] py-2 pl-3.5 pr-2">
                          <span className="flex items-baseline gap-2">
                            <span
                              className={`w-5 shrink-0 text-right text-[12px] font-bold tabular-nums ${
                                rank != null
                                  ? MEDALS[rank - 1] ??
                                    "text-[var(--mut)]"
                                  : "text-[var(--mut)] opacity-50"
                              }`}
                            >
                              {rank ?? "·"}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold leading-tight">
                                {r.title}
                              </span>
                              <span className="block truncate text-[10.5px] text-[var(--mut)]">
                                {r.debuts.has(activeSort) && (
                                  <span className={`mr-1 font-bold ${UP}`}>
                                    new
                                  </span>
                                )}
                                {move !== 0 && (
                                  <span
                                    className={`mr-1 font-bold ${move > 0 ? UP : DOWN}`}
                                  >
                                    {move > 0 ? `▲${move}` : `▼${-move}`}
                                  </span>
                                )}
                                {r.org}
                              </span>
                            </span>
                          </span>
                        </td>
                        {boards.map((b) => {
                          const v = r.values.get(b.key);
                          const on = b.key === activeSort;
                          const dv = r.deltas.get(b.key);
                          return (
                            <td
                              key={b.key}
                              className={`px-3 py-2 text-right text-[13px] tabular-nums ${
                                v == null
                                  ? "text-[var(--mut)] opacity-40"
                                  : on
                                    ? "font-bold text-[var(--acc)]"
                                    : "text-[var(--text)] opacity-80"
                              }`}
                            >
                              {v ?? "—"}
                              {v != null &&
                                (r.debuts.has(b.key) ? (
                                  <span
                                    className={`block text-[9px] font-semibold leading-tight ${UP}`}
                                  >
                                    new
                                  </span>
                                ) : dv != null && dv !== 0 ? (
                                  <span
                                    className={`block text-[9px] font-semibold leading-tight tabular-nums ${dv > 0 ? UP : DOWN}`}
                                  >
                                    {fmtDelta(dv)}
                                  </span>
                                ) : null)}
                            </td>
                          );
                        })}
                      </tr>
                      {expanded && (
                        <tr>
                          <td
                            colSpan={boards.length + 1}
                            className="expand-in bg-[var(--acc-dim)] px-3.5 py-3"
                          >
                            {r.summary && (
                              <p className="text-[12px] leading-relaxed text-[var(--mut)]">
                                {r.summary}
                              </p>
                            )}
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 inline-block rounded-lg border border-[var(--acc)] px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.12em] text-[var(--acc)]"
                            >
                              Open →
                            </a>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--line)] px-3.5 py-2 text-right font-mono text-[9px] tracking-[0.08em] text-[var(--mut)]">
            LMArena · Elo (Agent: win score)
            {deltaDays ? ` · Δ vs ${deltaDays}d ago` : ""} · tap a column to
            sort
          </p>
        </div>
      )}
    </div>
  );
}
