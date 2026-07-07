"use client";

import { Fragment, useMemo } from "react";
import type { CachedBlob, Item, ItemType } from "@/lib/types";
import type { Visit } from "@/lib/visit";
import { BookmarkButton, relDate, topSignalLabel } from "./ItemCard";
import { BRIEF_THEME, SOURCE_THEME, TYPE_THEME, primarySource } from "./theme";

// The "Today" tab, structured as three reading speeds for the daily
// check-in: (1) the Gemini-written brief — the 60-second version; (2) tile
// sections — "Since your last visit" first, then "Still trending" — the
// 5-minute scan; (3) the tabs below as the deep dive. Tiles link straight
// to the source (no expand step). Selection drops near-duplicate stories
// that surface on several tabs at once (a model launch is typically an
// article + an HF model + a thread). A "Saved" list of bookmarked items
// closes the loop for reads that don't fit in the daily window.
const SECTIONS: { type: ItemType; label: string; take: number; hero: boolean }[] =
  [
    { type: "article", label: "News", take: 3, hero: true },
    { type: "paper", label: "Papers", take: 3, hero: true },
    { type: "model", label: "Releases", take: 2, hero: false },
    { type: "discussion", label: "Discussions", take: 2, hero: false },
  ];

// Caps for the new-since-last-visit block: a bit roomier than the trending
// grid, since "everything new to you" is the app's core promise.
const NEW_TAKE: Record<ItemType, number> = {
  article: 4,
  paper: 4,
  model: 3,
  llm: 0,
  discussion: 2,
};

const DAY_MS = 86400_000;

function norm(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A story counts as already-covered when one normalized title contains the
// other (long enough to not fire on generic words).
function isDup(seen: string[], title: string): boolean {
  const n = norm(title);
  return seen.some(
    (s) =>
      (n.length >= 12 && s.includes(n)) || (s.length >= 12 && n.includes(s))
  );
}

// Take up to `take` items from a traction-ordered pool, skipping items
// already shown anywhere on the page (by id or near-duplicate title).
function pick(
  pool: Item[],
  take: number,
  seen: string[],
  shown: Set<string>
): Item[] {
  const out: Item[] = [];
  for (const it of pool) {
    if (shown.has(it.id) || isDup(seen, it.title)) continue;
    out.push(it);
    shown.add(it.id);
    seen.push(norm(it.title));
    if (out.length === take) break;
  }
  return out;
}

// Prefer the last 3 days; relax if the tab is quiet. Server order = traction.
function freshPool(items: Item[], need: number): Item[] {
  const fresh = (days: number) =>
    items.filter(
      (it) => Date.now() - new Date(it.firstSeenDate).getTime() <= days * DAY_MS
    );
  let pool = fresh(3);
  if (pool.length < need) pool = fresh(7);
  if (pool.length < need) pool = items;
  return pool;
}

function Tile({
  item,
  hero,
  visit,
}: {
  item: Item;
  hero: boolean;
  visit: Visit;
}) {
  const src = primarySource([...new Set(item.signals.map((s) => s.source))]);
  const st = SOURCE_THEME[src];
  const isNew = visit.isNew(item.firstSeenDate);
  const read = visit.opened.has(item.id);
  const meta = item.type === "paper" ? "" : item.authorsOrSource;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => visit.markOpened(item.id)}
      className={`card-in flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white/90 p-2.5 transition-[transform,opacity] active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900/85 ${
        hero ? "col-span-2" : ""
      } ${read ? "opacity-55" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-[10px] leading-none">
        {st && (
          <span className={`rounded px-1 py-0.5 font-semibold ${st.chip}`}>
            {st.label}
          </span>
        )}
        {hero && meta && (
          <span className="truncate text-zinc-500">{meta}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-zinc-400 dark:text-zinc-500">
          {isNew && (
            <span className={`font-bold ${TYPE_THEME[item.type].text}`}>
              new
            </span>
          )}
          {relDate(item.firstSeenDate)}
        </span>
        <BookmarkButton
          saved={visit.isSaved(item.id)}
          onToggle={() => visit.toggleSaved(item)}
        />
      </span>
      <span
        className={`line-clamp-2 font-semibold leading-snug ${
          hero ? "text-[13.5px]" : "text-[12px]"
        }`}
      >
        {item.title}
      </span>
      <span className="mt-auto truncate text-[10px] text-zinc-500">
        {topSignalLabel(item.signals)}
      </span>
    </a>
  );
}

function SectionHeader({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div
      className={`col-span-2 flex items-center gap-3 px-1 pt-2 text-[10.5px] font-bold uppercase leading-none tracking-wide ${
        accent ? BRIEF_THEME.text : "text-zinc-400 dark:text-zinc-600"
      }`}
    >
      {text}
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

type SectionGroup = {
  type: ItemType;
  label: string;
  hero: boolean;
  items: Item[];
};

function TileGrid({ groups, visit }: { groups: SectionGroup[]; visit: Visit }) {
  return (
    <>
      {groups.map((s) => (
        <Fragment key={s.type}>
          <div
            className={`col-span-2 px-1 pt-1.5 text-[10.5px] font-semibold uppercase leading-none tracking-wide ${TYPE_THEME[s.type].text}`}
          >
            {s.label}
          </div>
          {s.items.map((it, i) => (
            <Tile key={it.id} item={it} hero={s.hero && i === 0} visit={visit} />
          ))}
        </Fragment>
      ))}
    </>
  );
}

export default function Briefing({
  tabs,
  visit,
  brief,
}: {
  tabs: CachedBlob["tabs"];
  visit: Visit;
  brief: { bullets: string[] } | null;
}) {
  const { newGroups, trendingGroups } = useMemo(() => {
    const seen: string[] = [];
    const shown = new Set<string>();

    // Everything new since the last visit, capped per type, shown first.
    const newGroups: SectionGroup[] = SECTIONS.map((s) => ({
      ...s,
      items: pick(
        (tabs[s.type]?.items ?? []).filter((it) =>
          visit.isNew(it.firstSeenDate)
        ),
        NEW_TAKE[s.type],
        seen,
        shown
      ),
    })).filter((s) => s.items.length > 0);

    // The standing top-of-the-window picks, minus anything shown above.
    const trendingGroups: SectionGroup[] = SECTIONS.map((s) => ({
      ...s,
      items: pick(
        freshPool(tabs[s.type]?.items ?? [], s.take),
        s.take,
        seen,
        shown
      ),
    })).filter((s) => s.items.length > 0);

    return { newGroups, trendingGroups };
  }, [tabs, visit.isNew]);

  if (newGroups.length === 0 && trendingGroups.length === 0)
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        Nothing to brief yet — run the refresh endpoint once (see README).
      </p>
    );

  const hasSplit = newGroups.length > 0;

  return (
    <div className="mt-1 grid grid-cols-2 gap-2">
      {brief && brief.bullets.length > 0 && (
        <div
          className={`card-in col-span-2 rounded-xl border border-violet-200/70 bg-violet-500/[0.06] p-3 dark:border-violet-900/50`}
        >
          <div
            className={`text-[10.5px] font-bold uppercase leading-none tracking-wide ${BRIEF_THEME.text}`}
          >
            Daily brief
          </div>
          <ul className="mt-2 space-y-1.5">
            {brief.bullets.map((b, i) => (
              <li
                key={i}
                className="flex gap-2 text-[12.5px] leading-snug text-zinc-700 dark:text-zinc-300"
              >
                <span className={`select-none ${BRIEF_THEME.text}`}>›</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasSplit && (
        <>
          <SectionHeader text="Since your last visit" accent />
          <TileGrid groups={newGroups} visit={visit} />
        </>
      )}
      {trendingGroups.length > 0 && (
        <>
          {hasSplit ? (
            <SectionHeader text="Still trending" />
          ) : (
            visit.boundary != null && (
              <SectionHeader text="Nothing new since your last visit — today's top" />
            )
          )}
          <TileGrid groups={trendingGroups} visit={visit} />
        </>
      )}

      {visit.saved.length > 0 && (
        <>
          <SectionHeader text="Saved for later" />
          <ul className="col-span-2 space-y-1.5">
            {visit.saved.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/85"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_THEME[s.type].bar}`}
                />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => visit.markOpened(s.id)}
                  className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
                >
                  {s.title}
                </a>
                <BookmarkButton saved onToggle={() => visit.toggleSaved(s)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
