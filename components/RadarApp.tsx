"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CachedBlob, DigestStory, Item, ItemType } from "@/lib/types";
import { useVisit } from "@/lib/visit";
import { useSwipeNav } from "./useSwipeNav";
import ItemCard from "./ItemCard";
import LlmBoard from "./LlmBoard";
import Briefing from "./Briefing";
import ChatSheet from "./ChatSheet";
import NoteSheet, { type NoteTarget } from "./NoteSheet";
import SavedList from "./SavedList";
import ThemeMenu from "./ThemeMenu";
import RadarRings from "./RadarRings";
import { LABS, LANE_LABEL, SOURCE_LABEL } from "./theme";

interface TabMeta {
  enabled: boolean;
  windowDays: number;
  label: string;
}

interface ApiPayload {
  generatedAt: string | null;
  tabs: CachedBlob["tabs"];
  llmDeltaDays: number | null;
  digest: { stories: DigestStory[] } | null;
  config: Record<ItemType, TabMeta>;
}

const TYPE_ORDER: ItemType[] = [
  "paper",
  "model",
  "llm",
  "article",
  "discussion",
];

// Four modes in the bar: the brief, the browsable lanes, the reading list,
// and the chat sheet (an overlay, not a route).
type Mode = "brief" | "feeds" | "saved";

function labHaystack(it: Item): string {
  return `${it.title} ${it.summary} ${it.authorsOrSource} ${it.url}`;
}

type SortMode = "top" | "new" | "talked" | "weeks";

const WEEK_LABELS = ["THIS WEEK", "LAST WEEK", "2 WEEKS AGO", "3+ WEEKS AGO"];

function commentCount(it: Item): number {
  return it.signals
    .filter((s) => s.metric === "comments")
    .reduce((sum, s) => sum + s.value, 0);
}

export default function RadarApp() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("brief");
  const [lane, setLane] = useState<ItemType | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [search, setSearch] = useState("");
  const [windowFilter, setWindowFilter] = useState<number | null>(null); // days; null = full lane window
  const [sort, setSort] = useState<SortMode>("top");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // Lab shortcut persists across lane switches — "following a company" mode.
  const [labFilter, setLabFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const visit = useVisit();

  const load = useCallback(
    () =>
      fetch("/api/items")
        .then((r) => r.json())
        .then((d: ApiPayload) => {
          setData(d);
          setLane((cur) => {
            const firstEnabled = TYPE_ORDER.find((t) => d.config[t]?.enabled);
            return cur && d.config[cur]?.enabled
              ? cur
              : (firstEnabled ?? null);
          });
        })
        .catch((e) => setError(String(e))),
    []
  );

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Manual refresh: kicks the server pipeline (debounced server-side to one
  // run per 30 min), then re-pulls the blob. The run takes ~20-40s.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      /* surfaced via the unchanged sync timestamp */
    }
    await load();
    setRefreshing(false);
  }, [load]);

  const lanes = useMemo(
    () => TYPE_ORDER.filter((t) => data?.config[t]?.enabled),
    [data]
  );
  const activeLane = lane && lanes.includes(lane) ? lane : lanes[0];

  const switchLane = (t: ItemType) => {
    setLane(t);
    setSort("top");
    setSourceFilter(null);
    window.scrollTo({ top: 0 });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    window.scrollTo({ top: 0 });
  };

  // Swipe left/right switches lanes while browsing Feeds.
  const dragX = useRef(0);
  const swipe = useSwipeNav<string>({
    order: mode === "feeds" ? lanes : [mode],
    active: mode === "feeds" ? (activeLane ?? "feeds") : mode,
    onCommit: (t) => switchLane(t as ItemType),
    xShift: dragX,
  });

  // New-since-last-visit counts per lane. The LLM leaderboard is excluded:
  // every row carries the latest fetch date, so it would always read "new".
  const newCounts = useMemo(() => {
    const counts = new Map<ItemType, number>();
    if (!data || visit.boundary == null) return counts;
    for (const t of TYPE_ORDER) {
      if (t === "llm") continue;
      const n = (data.tabs[t]?.items ?? []).filter((it) =>
        visit.isNew(it.firstSeenDate)
      ).length;
      if (n > 0) counts.set(t, n);
    }
    return counts;
  }, [data, visit.boundary, visit.isNew]);

  const totalNew = useMemo(
    () => [...newCounts.values()].reduce((a, b) => a + b, 0),
    [newCounts]
  );

  const laneItems =
    mode === "feeds" && activeLane ? (data?.tabs[activeLane]?.items ?? []) : [];

  // Sources present in this lane, for the filter chips.
  const laneSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of laneItems)
      for (const src of new Set(it.signals.map((s) => s.source)))
        counts.set(src, (counts.get(src) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [laneItems]);

  const hasComments = useMemo(
    () => laneItems.some((it) => commentCount(it) > 0),
    [laneItems]
  );

  const labCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lab of LABS) {
      const n = laneItems.filter((it) => lab.re.test(labHaystack(it))).length;
      if (n > 0) counts.set(lab.id, n);
    }
    return counts;
  }, [laneItems]);

  const items = useMemo(() => {
    let list = laneItems;
    if (labFilter) {
      const lab = LABS.find((l) => l.id === labFilter);
      if (lab) list = list.filter((it) => lab.re.test(labHaystack(it)));
    }
    if (sourceFilter) {
      list = list.filter((it) =>
        it.signals.some((s) => s.source === sourceFilter)
      );
    }
    if (windowFilter != null) {
      const cutoff = Date.now() - windowFilter * 86400_000;
      list = list.filter(
        (it) => new Date(it.firstSeenDate).getTime() >= cutoff
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.summary.toLowerCase().includes(q) ||
          it.authorsOrSource.toLowerCase().includes(q) ||
          it.tags.some((t) => t.includes(q))
      );
    }
    if (sort === "new") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.firstSeenDate).getTime() -
          new Date(a.firstSeenDate).getTime()
      );
    } else if (sort === "talked") {
      list = [...list].sort((a, b) => commentCount(b) - commentCount(a));
    }
    return list; // "top" keeps the server's traction order
  }, [laneItems, search, windowFilter, sort, sourceFilter, labFilter]);

  const maxScore = Math.max(...items.map((it) => it.tractionScore), 0.001);
  const isLeaderboard = activeLane === "llm";
  const laneConfig =
    mode === "feeds" && activeLane ? data?.config[activeLane] : null;
  const laneWindow = laneConfig?.windowDays ?? 21;
  const windowOptions = [1, 2, 3, 7, 14].filter((d) => d < laneWindow);
  const laneFailed =
    mode === "feeds" &&
    activeLane &&
    data?.tabs[activeLane] &&
    laneItems.length === 0 &&
    data.tabs[activeLane]!.sources.every((s) => !s.ok);

  const SORTS: { id: SortMode; label: string }[] = [
    { id: "top", label: "TOP" },
    { id: "new", label: "NEW" },
    ...(hasComments ? [{ id: "talked" as SortMode, label: "TALK" }] : []),
    ...(laneWindow > 9 ? [{ id: "weeks" as SortMode, label: "WKS" }] : []),
  ];

  // Weeks view: the top few survivors of each 7-day bucket.
  const weekGroups = useMemo(() => {
    if (sort !== "weeks") return null;
    const groups = new Map<number, Item[]>();
    for (const it of items) {
      const wk = Math.min(
        WEEK_LABELS.length - 1,
        Math.floor(
          (Date.now() - new Date(it.firstSeenDate).getTime()) /
            (7 * 86400_000)
        )
      );
      const g = groups.get(wk) ?? [];
      if (g.length < 5) {
        g.push(it);
        groups.set(wk, g);
      }
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [items, sort]);

  const chip = (on: boolean) =>
    `shrink-0 rounded-lg border px-2 py-1 font-mono text-[9.5px] tracking-[0.12em] transition-colors ${
      on
        ? "border-[var(--acc)] font-bold text-[var(--acc)]"
        : "border-[var(--line)] text-[var(--mut)]"
    }`;

  return (
    <>
      <RadarRings />
      <main className="relative z-10 mx-auto max-w-xl px-3 pb-28">
        <header className="sticky top-0 z-10 -mx-3 bg-[var(--bg)]/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          {/* Masthead: the instrument line */}
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-2 font-mono text-[14px] font-bold tracking-[0.14em]">
              <span className="relative flex h-2 w-2">
                <span className="blip-ring absolute inline-flex h-full w-full rounded-full border border-[var(--acc)]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--acc)]" />
              </span>
              AI&nbsp;RADAR
            </span>
            <span className="flex items-center gap-3">
              {data?.generatedAt && (
                <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--mut)]">
                  <span className="text-[var(--acc)]">▲</span> SYNC{" "}
                  {relTime(data.generatedAt)}
                </span>
              )}
              <button
                aria-label="Refresh feed"
                disabled={refreshing}
                onClick={refresh}
                className="text-[var(--mut)] active:text-[var(--text)] disabled:opacity-60"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                  <path d="M20 3v4h-4" />
                </svg>
              </button>
              <ThemeMenu />
            </span>
          </div>

          {/* Second line: date + new count (brief) or the lane strip (feeds) */}
          {mode === "brief" && (
            <div className="mt-2 flex items-center justify-between border-b border-[var(--line)] px-1 pb-2.5 font-mono text-[9.5px] tracking-[0.14em] text-[var(--mut)]">
              <span>
                {new Date()
                  .toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                  .toUpperCase()}
                {totalNew > 0 && (
                  <>
                    {" · "}
                    <span className="font-bold text-[var(--acc)]">
                      {totalNew} NEW
                    </span>
                  </>
                )}
              </span>
              {totalNew > 0 && (
                <button
                  onClick={visit.markCaughtUp}
                  className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[9px] tracking-[0.1em] text-[var(--mut)] transition-all active:scale-95"
                >
                  ✓ CAUGHT UP
                </button>
              )}
            </div>
          )}

          {mode === "feeds" && (
            <>
              <div className="no-scrollbar -mx-3 mt-2 flex gap-6 overflow-x-auto border-b border-[var(--line)] px-4">
                {lanes.map((t) => {
                  const on = t === activeLane;
                  const n = newCounts.get(t) ?? 0;
                  return (
                    <button
                      key={t}
                      onClick={() => switchLane(t)}
                      className={`relative shrink-0 pb-2.5 font-mono text-[10.5px] tracking-[0.16em] ${
                        on ? "font-bold text-[var(--text)]" : "text-[var(--mut)]"
                      }`}
                    >
                      {LANE_LABEL[t]}
                      {n > 0 && (
                        <span className="ml-1 align-super text-[8px] font-bold text-[var(--acc)]">
                          {n}
                        </span>
                      )}
                      {on && (
                        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--acc)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search + filters */}
              <div className="mt-2 flex gap-2 px-1">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`SEARCH ${activeLane ? LANE_LABEL[activeLane] : ""}…`}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] outline-none placeholder:text-[var(--mut)] focus:border-[var(--acc)]"
                />
                {!isLeaderboard && (
                  <select
                    value={windowFilter ?? ""}
                    onChange={(e) =>
                      setWindowFilter(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 font-mono text-[10.5px] text-[var(--mut)]"
                  >
                    <option value="">{laneWindow}D</option>
                    {windowOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}D
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="no-scrollbar -mx-3 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 pb-2">
                {!isLeaderboard &&
                  SORTS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSort(s.id)}
                      className={chip(sort === s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                {LABS.filter((l) => labCounts.has(l.id)).map((lab) => {
                  const on = labFilter === lab.id;
                  return (
                    <button
                      key={lab.id}
                      onClick={() => setLabFilter(on ? null : lab.id)}
                      className={chip(on)}
                    >
                      {lab.label.toUpperCase()}{" "}
                      <span className="opacity-60">{labCounts.get(lab.id)}</span>
                    </button>
                  );
                })}
                {laneSources.length > 1 &&
                  laneSources.map(([src, count]) => {
                    const on = sourceFilter === src;
                    return (
                      <button
                        key={src}
                        onClick={() => setSourceFilter(on ? null : src)}
                        className={chip(on)}
                      >
                        {SOURCE_LABEL[src] ?? src.toUpperCase()}{" "}
                        <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </header>

        <div
          ref={swipe.ref}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
          onTouchCancel={swipe.onTouchEnd}
          className="min-h-[60vh] touch-pan-y will-change-transform"
        >
          {error && (
            <p className="py-10 text-center font-mono text-[11px] tracking-[0.1em] text-[var(--alert)]">
              FAILED TO LOAD: {error}
            </p>
          )}
          {!data && !error && (
            <p className="py-10 text-center font-mono text-[11px] tracking-[0.14em] text-[var(--mut)]">
              SCANNING…
            </p>
          )}

          {mode === "brief" && data && (
            <Briefing tabs={data.tabs} visit={visit} digest={data.digest} />
          )}

          {mode === "saved" && (
            <SavedList visit={visit} onNote={setNoteTarget} />
          )}

          {mode === "feeds" &&
            data &&
            items.length === 0 &&
            (!isLeaderboard || laneItems.length === 0) && (
              <div className="px-6 py-10 text-center text-sm text-[var(--mut)]">
                {!data.generatedAt ? (
                  "No data yet — run the refresh endpoint once (see README)."
                ) : laneFailed ? (
                  <>
                    <p>Every source for this lane failed on the last sync.</p>
                    <p className="mt-2 text-xs">
                      This lane is Reddit-only — if Reddit is blocking the
                      server, add the free Reddit API credentials described in
                      the README.
                    </p>
                  </>
                ) : (
                  "Nothing matches."
                )}
              </div>
            )}

          {mode === "feeds" && isLeaderboard ? (
            <LlmBoard
              items={items}
              allItems={laneItems}
              deltaDays={data?.llmDeltaDays ?? null}
            />
          ) : mode !== "feeds" ? null : weekGroups ? (
            <ul key={`${activeLane}-weeks-${sourceFilter}-${labFilter}`}>
              {(() => {
                let i = 0;
                return weekGroups.map(([wk, group]) => (
                  <Fragment key={wk}>
                    <li className="flex items-center gap-3 px-1 pb-1 pt-4 font-mono text-[9.5px] font-bold tracking-[0.2em] text-[var(--mut)]">
                      {WEEK_LABELS[wk]}
                      <span className="h-px flex-1 bg-[var(--line)]" />
                    </li>
                    {group.map((it) => (
                      <ItemCard
                        key={it.id}
                        item={it}
                        maxScore={maxScore}
                        index={i++}
                        isNew={visit.isNew(it.firstSeenDate)}
                        isRead={visit.opened.has(it.id)}
                        onOpen={visit.markOpened}
                        isSaved={visit.isSaved(it.id)}
                        onToggleSave={visit.toggleSaved}
                        note={visit.notes[it.id]?.text}
                        onNote={setNoteTarget}
                      />
                    ))}
                  </Fragment>
                ));
              })()}
            </ul>
          ) : (
            /* Keyed by lane+sort so entrance stagger replays on real view
               changes, but not while typing in search. */
            <ul key={`${activeLane}-${sort}-${sourceFilter}-${labFilter}`}>
              {items.map((it, i) => {
                const isNew = visit.isNew(it.firstSeenDate);
                // In date order, mark where "new to you" ends.
                const divider =
                  sort === "new" &&
                  !isNew &&
                  i > 0 &&
                  visit.isNew(items[i - 1].firstSeenDate);
                return (
                  <Fragment key={it.id}>
                    {divider && (
                      <li className="flex items-center gap-3 px-1 pb-1 pt-3 font-mono text-[9px] font-bold tracking-[0.2em] text-[var(--mut)]">
                        <span className="h-px flex-1 bg-[var(--line)]" />
                        SEEN ON YOUR LAST VISIT
                        <span className="h-px flex-1 bg-[var(--line)]" />
                      </li>
                    )}
                    <ItemCard
                      item={it}
                      maxScore={maxScore}
                      index={i}
                      isNew={isNew}
                      isRead={visit.opened.has(it.id)}
                      onOpen={visit.markOpened}
                      isSaved={visit.isSaved(it.id)}
                      onToggleSave={visit.toggleSaved}
                      note={visit.notes[it.id]?.text}
                      onNote={setNoteTarget}
                    />
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom bar: four modes, thumb-reach on a phone */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-xl px-2 py-1.5">
            <BarButton
              label="TODAY"
              on={mode === "brief" && !chatOpen}
              badge={totalNew}
              onClick={() => switchMode("brief")}
              icon={
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 12L17 7" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </>
              }
            />
            <BarButton
              label="FEEDS"
              on={mode === "feeds" && !chatOpen}
              onClick={() => switchMode("feeds")}
              icon={<path d="M4 6h16M4 12h16M4 18h16" />}
            />
            <BarButton
              label="SAVED"
              on={mode === "saved" && !chatOpen}
              badge={mode !== "saved" ? visit.saved.length : 0}
              muteBadge
              onClick={() => switchMode("saved")}
              icon={
                <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
              }
            />
            <BarButton
              label="CHAT"
              on={chatOpen}
              onClick={() => setChatOpen(true)}
              icon={<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />}
            />
          </div>
        </nav>

        <ChatSheet open={chatOpen} onOpenChange={setChatOpen} />

        {noteTarget && (
          <NoteSheet
            key={noteTarget.id}
            target={noteTarget}
            initial={visit.notes[noteTarget.id]?.text ?? ""}
            onSave={(text) => {
              visit.setNote(noteTarget, text);
              setNoteTarget(null);
            }}
            onClose={() => setNoteTarget(null)}
          />
        )}
      </main>
    </>
  );
}

function BarButton({
  label,
  on,
  onClick,
  icon,
  badge = 0,
  muteBadge = false,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  badge?: number;
  muteBadge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 py-1.5 font-mono text-[9px] tracking-[0.12em] transition-all active:scale-95 ${
        on ? "font-bold text-[var(--acc)]" : "text-[var(--mut)]"
      }`}
    >
      <span className="relative">
        <svg
          viewBox="0 0 24 24"
          className="h-[19px] w-[19px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
        {badge > 0 && (
          <span
            className={`absolute -right-2 -top-1 font-mono text-[8px] font-bold ${
              muteBadge ? "text-[var(--mut)]" : "text-[var(--acc)]"
            }`}
          >
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}M`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}H`;
  return `${Math.round(hrs / 24)}D`;
}
