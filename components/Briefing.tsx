"use client";

import { Fragment, useMemo } from "react";
import type { CachedBlob, DigestStory, Item, ItemType } from "@/lib/types";
import type { Visit } from "@/lib/visit";
import { BookmarkButton, relDate, topSignalLabel } from "./ItemCard";
import { BRIEF_THEME, SOURCE_THEME, TYPE_THEME, primarySource } from "./theme";

// The "Today" tab as an inverted pyramid for the daily check-in: a lead
// story with the most visual weight, ranked stories 2-N below it, then an
// "Also on the radar" layer of one-liners, then the saved-for-later list.
// Stories come from the refresh-time Gemini digest (which groups a launch
// article + its weights + its thread into one story and applies the
// frontier-lab watchlist in lib/editorial.ts); the client attaches links,
// chips, and traction by resolving the story's item ids. When the digest
// is absent (no key / quota / old cache), the page falls back to the
// type-grouped tile grid below. "New since your last visit" is a badge on
// stories rather than a separate section — rank order stays editorial.

// ---------- Fallback tile grid ----------

const SECTIONS: { type: ItemType; label: string; take: number; hero: boolean }[] =
  [
    { type: "article", label: "News", take: 3, hero: true },
    { type: "paper", label: "Papers", take: 3, hero: true },
    { type: "model", label: "Releases", take: 2, hero: false },
    { type: "discussion", label: "Discussions", take: 2, hero: false },
  ];

const NEW_TAKE: Record<ItemType, number> = {
  article: 4,
  paper: 4,
  model: 3,
  llm: 0,
  discussion: 2,
};

// "Also on the radar" breadth per type in digest mode.
const RADAR_TAKE: Record<ItemType, number> = {
  article: 2,
  paper: 3,
  model: 2,
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

// ---------- Digest (story) layout ----------

interface ResolvedStory extends DigestStory {
  items: Item[]; // ids resolved against the cached tabs; [0] = primary
}

// Relative traction of the story's primary item within its own tab,
// as a 3-step meter — "how loud is this" at a glance, no numbers.
function tractionTier(it: Item, tabs: CachedBlob["tabs"]): number {
  const max = Math.max(
    ...(tabs[it.type]?.items ?? []).map((i) => i.tractionScore),
    0.001
  );
  const r = it.tractionScore / max;
  return r >= 0.6 ? 3 : r >= 0.25 ? 2 : 1;
}

function StoryMeta({
  story,
  tabs,
  visit,
}: {
  story: ResolvedStory;
  tabs: CachedBlob["tabs"];
  visit: Visit;
}) {
  const primary = story.items[0];
  const tier = tractionTier(primary, tabs);
  const isNew = story.items.some((it) => visit.isNew(it.firstSeenDate));
  return (
    <span className="flex min-w-0 items-center gap-2 text-[10.5px] leading-none text-zinc-400 dark:text-zinc-500">
      <span className="shrink-0 tracking-[-0.08em]">
        <span className={TYPE_THEME[primary.type].text}>
          {"▮".repeat(tier)}
        </span>
        <span className="opacity-25">{"▮".repeat(3 - tier)}</span>
      </span>
      <span className="truncate">{topSignalLabel(primary.signals)}</span>
      {/* Every underlying item is tappable: article, weights, thread… */}
      {story.items.map((it) => {
        const st =
          SOURCE_THEME[
            primarySource([...new Set(it.signals.map((s) => s.source))])
          ];
        if (!st) return null;
        return (
          <a
            key={it.id}
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => visit.markOpened(it.id)}
            className={`shrink-0 rounded px-1 py-0.5 font-semibold ${st.chip}`}
          >
            {st.label}
          </a>
        );
      })}
      {isNew && (
        <span className={`shrink-0 font-bold ${BRIEF_THEME.text}`}>● new</span>
      )}
      <span className="ml-auto" />
      <BookmarkButton
        saved={visit.isSaved(primary.id)}
        onToggle={() => visit.toggleSaved(primary)}
      />
    </span>
  );
}

function StoryBlock({
  story,
  index,
  tabs,
  visit,
}: {
  story: ResolvedStory;
  index: number;
  tabs: CachedBlob["tabs"];
  visit: Visit;
}) {
  const primary = story.items[0];
  const read = story.items.every((it) => visit.opened.has(it.id));
  const lead = index === 0;
  return (
    <div
      className={`card-in rounded-2xl border border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/85 ${
        lead ? "p-4" : "px-4 py-3"
      } ${read ? "opacity-60" : ""}`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="flex gap-2.5">
        {!lead && (
          <span
            className={`pt-0.5 text-[13px] font-bold tabular-nums ${BRIEF_THEME.text}`}
          >
            {index + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => visit.markOpened(primary.id)}
            className={`block font-bold leading-snug ${
              lead ? "text-[17px]" : "text-[14px]"
            }`}
          >
            {story.headline}
          </a>
          {story.why && (
            <p
              className={`mt-1 leading-snug text-zinc-600 dark:text-zinc-400 ${
                lead ? "text-[13px]" : "text-[12px]"
              }`}
            >
              {story.why}
            </p>
          )}
          <div className="mt-2">
            <StoryMeta story={story} tabs={tabs} visit={visit} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RadarRow({ item, visit }: { item: Item; visit: Visit }) {
  const isNew = visit.isNew(item.firstSeenDate);
  return (
    <li
      className={`flex items-center gap-2 px-1 py-1 ${
        visit.opened.has(item.id) ? "opacity-55" : ""
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_THEME[item.type].bar}`}
      />
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => visit.markOpened(item.id)}
        className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
      >
        {item.title}
      </a>
      {isNew && (
        <span className={`shrink-0 text-[10px] font-bold ${BRIEF_THEME.text}`}>
          ●
        </span>
      )}
      <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
        {topSignalLabel(item.signals)}
      </span>
      <BookmarkButton
        saved={visit.isSaved(item.id)}
        onToggle={() => visit.toggleSaved(item)}
      />
    </li>
  );
}

// ---------- Page ----------

export default function Briefing({
  tabs,
  visit,
  digest,
}: {
  tabs: CachedBlob["tabs"];
  visit: Visit;
  digest: { stories: DigestStory[] } | null;
}) {
  // Resolve digest ids against the cached items; a story survives as long
  // as one id resolves. An unresolvable digest (stale cache) → tile mode.
  const stories = useMemo<ResolvedStory[]>(() => {
    if (!digest?.stories) return [];
    const byId = new Map<string, Item>();
    for (const tab of Object.values(tabs))
      for (const it of tab?.items ?? []) byId.set(it.id, it);
    return digest.stories
      .map((s) => ({
        ...s,
        items: s.ids
          .map((id) => byId.get(id))
          .filter((it): it is Item => Boolean(it)),
      }))
      .filter((s) => s.items.length > 0);
  }, [digest, tabs]);

  const storyMode = stories.length >= 2;

  // "Also on the radar": breadth below the stories, everything not already
  // covered by them. Same picker as the tile fallback.
  const radar = useMemo<SectionGroup[]>(() => {
    if (!storyMode) return [];
    const seen: string[] = stories.flatMap((s) => [
      norm(s.headline),
      ...s.items.map((it) => norm(it.title)),
    ]);
    const shown = new Set(stories.flatMap((s) => s.items.map((it) => it.id)));
    return SECTIONS.map((s) => ({
      ...s,
      items: pick(
        freshPool(tabs[s.type]?.items ?? [], RADAR_TAKE[s.type]),
        RADAR_TAKE[s.type],
        seen,
        shown
      ),
    })).filter((s) => s.items.length > 0);
  }, [storyMode, stories, tabs]);

  // Tile fallback (also the empty-cache message).
  const { newGroups, trendingGroups } = useMemo(() => {
    if (storyMode)
      return { newGroups: [] as SectionGroup[], trendingGroups: [] as SectionGroup[] };
    const seen: string[] = [];
    const shown = new Set<string>();
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
  }, [storyMode, tabs, visit.isNew]);

  if (!storyMode && newGroups.length === 0 && trendingGroups.length === 0)
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        Nothing to brief yet — run the refresh endpoint once (see README).
      </p>
    );

  const savedList = visit.saved.length > 0 && (
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
  );

  if (storyMode)
    return (
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div
          className={`col-span-2 px-1 pt-1 text-[10.5px] font-bold uppercase leading-none tracking-wide ${BRIEF_THEME.text}`}
        >
          Daily brief ·{" "}
          {new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </div>
        <div className="col-span-2 space-y-2">
          {stories.map((s, i) => (
            <StoryBlock
              key={s.items[0].id}
              story={s}
              index={i}
              tabs={tabs}
              visit={visit}
            />
          ))}
        </div>
        {radar.length > 0 && (
          <>
            <SectionHeader text="Also on the radar" />
            <ul className="col-span-2 space-y-0.5">
              {radar.flatMap((g) =>
                g.items.map((it) => (
                  <RadarRow key={it.id} item={it} visit={visit} />
                ))
              )}
            </ul>
          </>
        )}
        {savedList}
      </div>
    );

  const hasSplit = newGroups.length > 0;
  return (
    <div className="mt-1 grid grid-cols-2 gap-2">
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
      {savedList}
    </div>
  );
}
