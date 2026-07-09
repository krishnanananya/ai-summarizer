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
import GalaxyBackground from "./GalaxyBackground";
import {
  BRIEF_ACCENT,
  BRIEF_THEME,
  LABS,
  SOURCE_THEME,
  TYPE_ACCENT,
  TYPE_THEME,
} from "./theme";

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

// "brief" is the client-composed Today digest; the rest map to server tabs.
type TabKey = ItemType | "brief";

function labHaystack(it: Item): string {
  return `${it.title} ${it.summary} ${it.authorsOrSource} ${it.url}`;
}

type SortMode = "top" | "new" | "talked" | "weeks";

const WEEK_LABELS = ["This week", "Last week", "2 weeks ago", "3+ weeks ago"];

function commentCount(it: Item): number {
  return it.signals
    .filter((s) => s.metric === "comments")
    .reduce((sum, s) => sum + s.value, 0);
}

export default function RadarApp() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabKey>("brief");
  const [search, setSearch] = useState("");
  const [windowFilter, setWindowFilter] = useState<number | null>(null); // days; null = full tab window
  const [sort, setSort] = useState<SortMode>("top");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // Lab shortcut persists across tab switches — "following a company" mode.
  const [labFilter, setLabFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const visit = useVisit();

  const load = useCallback(
    () =>
      fetch("/api/items")
        .then((r) => r.json())
        .then((d: ApiPayload) => {
          setData(d);
          setActive((cur) => {
            const firstEnabled = TYPE_ORDER.find((t) => d.config[t]?.enabled);
            return cur !== "brief" && firstEnabled && !d.config[cur]?.enabled
              ? firstEnabled
              : cur;
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
      /* surfaced via the unchanged "updated" timestamp */
    }
    await load();
    setRefreshing(false);
  }, [load]);

  const switchTab = (t: TabKey) => {
    setActive(t);
    setSort("top");
    setSourceFilter(null);
    window.scrollTo({ top: 0 });
  };

  const enabledTabs = useMemo(
    () => TYPE_ORDER.filter((t) => data?.config[t]?.enabled),
    [data]
  );

  // Swipe left/right anywhere in the content to move between tabs; the
  // galaxy background pans along with the gesture (see useSwipeNav).
  const dragX = useRef(0);
  const swipe = useSwipeNav<TabKey>({
    order: ["brief", ...enabledTabs],
    active,
    onCommit: switchTab,
    xShift: dragX,
  });

  // New-since-last-visit counts per tab. The LLM leaderboard is excluded:
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

  const isBrief = active === "brief";
  const totalNew = useMemo(
    () => [...newCounts.values()].reduce((a, b) => a + b, 0),
    [newCounts]
  );

  const tabItems = isBrief ? [] : data?.tabs[active]?.items ?? [];

  // Sources present in this tab, for the filter chips.
  const tabSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of tabItems)
      for (const src of new Set(it.signals.map((s) => s.source)))
        counts.set(src, (counts.get(src) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [tabItems]);

  const hasComments = useMemo(
    () => tabItems.some((it) => commentCount(it) > 0),
    [tabItems]
  );

  // Per-lab match counts in this tab, for the shortcut chips.
  const labCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lab of LABS) {
      const n = tabItems.filter((it) => lab.re.test(labHaystack(it))).length;
      if (n > 0) counts.set(lab.id, n);
    }
    return counts;
  }, [tabItems]);

  const items = useMemo(() => {
    let list = tabItems;
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
  }, [tabItems, search, windowFilter, sort, sourceFilter, labFilter]);

  const maxScore = Math.max(...items.map((it) => it.tractionScore), 0.001);
  const isLeaderboard = active === "llm";
  const tabConfig = isBrief ? null : data?.config[active];
  const tabWindow = tabConfig?.windowDays ?? 21;
  const windowOptions = [1, 2, 3, 7, 14].filter((d) => d < tabWindow);
  const theme = isBrief ? BRIEF_THEME : TYPE_THEME[active];
  const tabFailed =
    !isBrief &&
    data?.tabs[active] &&
    tabItems.length === 0 &&
    data.tabs[active]!.sources.every((s) => !s.ok);

  const SORTS: { id: SortMode; label: string }[] = [
    { id: "top", label: "Top" },
    { id: "new", label: "New" },
    ...(hasComments ? [{ id: "talked" as SortMode, label: "Discussed" }] : []),
    // Only meaningful when the tab's window spans multiple weeks.
    ...(tabWindow > 9 ? [{ id: "weeks" as SortMode, label: "Weeks" }] : []),
  ];

  // Weeks view: the top few survivors of each 7-day bucket — "how has AI
  // been evolving", not "what is loudest right now". Items arrive in
  // traction order, so the first 5 per bucket are that week's winners.
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

  return (
    <>
    <GalaxyBackground
      accent={isBrief ? BRIEF_ACCENT : TYPE_ACCENT[active]}
      xShift={dragX}
    />
    <main className="relative z-10 mx-auto max-w-xl px-3 pb-28">
      <header className="sticky top-0 z-10 -mx-3 bg-zinc-100/90 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur dark:bg-zinc-950/90">
        <div className="flex items-baseline justify-between">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${theme.bar}`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${theme.bar}`}
              />
            </span>
            AI Radar
          </h1>
          {data?.generatedAt && (
            <span className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>
                {(() => {
                  const n = isBrief ? totalNew : newCounts.get(active) ?? 0;
                  return n > 0 ? (
                    <span className={`font-semibold ${theme.text}`}>
                      {n} new ·{" "}
                    </span>
                  ) : null;
                })()}
                updated {relTime(data.generatedAt)}
              </span>
              {totalNew > 0 && (
                <button
                  onClick={visit.markCaughtUp}
                  className="rounded-lg bg-zinc-200/70 px-2 py-1 font-semibold text-zinc-600 transition-all active:scale-95 dark:bg-zinc-900 dark:text-zinc-400"
                >
                  ✓ Caught up
                </button>
              )}
              <button
                aria-label="Refresh feed"
                disabled={refreshing}
                onClick={refresh}
                className="rounded-lg bg-zinc-200/70 p-1.5 text-zinc-600 transition-all active:scale-95 disabled:opacity-70 dark:bg-zinc-900 dark:text-zinc-400"
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
            </span>
          )}
        </div>
        {!isBrief && (
        <div className="mt-2 flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tabConfig?.label.toLowerCase() ?? ""}…`}
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600"
          />
          {!isLeaderboard && (
            <select
              value={windowFilter ?? ""}
              onChange={(e) =>
                setWindowFilter(e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">{tabWindow}d</option>
              {windowOptions.map((d) => (
                <option key={d} value={d}>
                  {d}d
                </option>
              ))}
            </select>
          )}
        </div>
        )}

        {/* Sort + source filters */}
        {!isBrief && (
        <div className="no-scrollbar -mx-3 mt-2 flex items-center gap-1.5 overflow-x-auto px-3">
          {!isLeaderboard && (
          <div className="flex shrink-0 rounded-lg bg-zinc-200/70 p-0.5 dark:bg-zinc-900">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  sort === s.id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-500"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          )}
          {/* Frontier-lab shortcuts */}
          {[...labCounts.keys()].length > 0 &&
            LABS.filter((l) => labCounts.has(l.id)).map((lab) => {
              const on = labFilter === lab.id;
              return (
                <button
                  key={lab.id}
                  onClick={() => setLabFilter(on ? null : lab.id)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    on
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-200/70 text-zinc-500 dark:bg-zinc-900"
                  }`}
                >
                  {lab.label}{" "}
                  <span className="font-normal opacity-60">
                    {labCounts.get(lab.id)}
                  </span>
                </button>
              );
            })}
          {tabSources.length > 1 &&
            tabSources.map(([src, count]) => {
              const st = SOURCE_THEME[src];
              const on = sourceFilter === src;
              return (
                <button
                  key={src}
                  onClick={() => setSourceFilter(on ? null : src)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    on
                      ? st?.chip ?? "bg-zinc-300 dark:bg-zinc-700"
                      : "bg-zinc-200/70 text-zinc-500 dark:bg-zinc-900"
                  }`}
                >
                  {st?.label ?? src}{" "}
                  <span className="font-normal opacity-60">{count}</span>
                </button>
              );
            })}
        </div>
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
        <p className="py-10 text-center text-sm text-red-500">
          Failed to load: {error}
        </p>
      )}
      {!data && !error && (
        <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
      )}
      {data && !isBrief && items.length === 0 && (!isLeaderboard || tabItems.length === 0) && (
        <div className="px-6 py-10 text-center text-sm text-zinc-500">
          {!data.generatedAt ? (
            "No data yet — run the refresh endpoint once (see README)."
          ) : tabFailed ? (
            <>
              <p>Every source for this tab failed on the last refresh.</p>
              <p className="mt-2 text-xs">
                This tab is Reddit-only — if Reddit is blocking the server, add
                the free Reddit API credentials described in the README.
              </p>
            </>
          ) : (
            "Nothing matches."
          )}
        </div>
      )}

      {isBrief && data && (
        <Briefing tabs={data.tabs} visit={visit} digest={data.digest} />
      )}
      {!isBrief && isLeaderboard ? (
        <LlmBoard
          items={items}
          allItems={tabItems}
          deltaDays={data?.llmDeltaDays ?? null}
        />
      ) : isBrief ? null : weekGroups ? (
        <ul key={`${active}-weeks-${sourceFilter}-${labFilter}`} className="mt-2 space-y-2.5">
          {(() => {
            let i = 0;
            return weekGroups.map(([wk, group]) => (
              <Fragment key={wk}>
                <li className="flex items-center gap-3 px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
                  {WEEK_LABELS[wk]}
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
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
                  />
                ))}
              </Fragment>
            ));
          })()}
        </ul>
      ) : (
        /* Keyed by tab+sort so entrance stagger replays on real view changes,
           but not while typing in search. */
        <ul
          key={`${active}-${sort}-${sourceFilter}-${labFilter}`}
          className="mt-2 space-y-2.5"
        >
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
                  <li className="flex items-center gap-3 px-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    seen on your last visit
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
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
                />
              </Fragment>
            );
          })}
        </ul>
      )}
      </div>

      {/* Bottom tab bar — one-handed reach on a phone */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-zinc-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-xl gap-1 px-2 py-2">
          {(["brief" as TabKey, ...enabledTabs]).map((t) => {
            const tTheme = t === "brief" ? BRIEF_THEME : TYPE_THEME[t];
            const badge = t === "brief" ? totalNew : newCounts.get(t) ?? 0;
            const isActive = active === t;
            return (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 rounded-xl py-2 text-[12.5px] font-semibold transition-all active:scale-95 ${
                  isActive
                    ? `${tTheme.softBg} ${tTheme.text}`
                    : "text-zinc-500 active:bg-zinc-200 dark:active:bg-zinc-900"
                }`}
              >
                {t === "brief" ? "Today" : data?.config[t]?.label ?? t}
                {badge > 0 && (
                  <span
                    className={`ml-1 rounded-full px-1 text-[9px] font-bold ${
                      isActive
                        ? "opacity-80"
                        : `${tTheme.softBg} ${tTheme.text}`
                    }`}
                  >
                    +{badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <ChatSheet />
    </main>
    </>
  );
}

function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
