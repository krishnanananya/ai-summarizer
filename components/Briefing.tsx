"use client";

import { Fragment, useMemo } from "react";
import type { CachedBlob, DigestStory, Item, ItemType } from "@/lib/types";
import type { Visit } from "@/lib/visit";
import { BookmarkButton, Meter, relDate, topSignalLabel } from "./ItemCard";
import { LANE_DOT, SOURCE_LABEL, primarySource } from "./theme";

// The Today mode as an inverted pyramid: lead story with the most visual
// weight, ranked stories 2-N, then "Also on the radar" one-liners. Stories
// come from the refresh-time Gemini digest (grouping a launch article + its
// weights + its thread, watchlist in lib/editorial.ts); the client attaches
// links, meters, and lane dots by resolving item ids. No digest (no key /
// quota / stale cache) → type-grouped fallback below. "New since your last
// visit" is a ● badge — rank order stays editorial.

const SECTIONS: { type: ItemType; label: string; take: number }[] = [
  { type: "article", label: "News", take: 3 },
  { type: "paper", label: "Papers", take: 3 },
  { type: "model", label: "Releases", take: 2 },
  { type: "discussion", label: "Discussions", take: 2 },
];

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

function isDup(seen: string[], title: string): boolean {
  const n = norm(title);
  return seen.some(
    (s) =>
      (n.length >= 12 && s.includes(n)) || (s.length >= 12 && n.includes(s))
  );
}

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

function SectionHeader({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-1 pb-1 pt-4 font-mono text-[9.5px] font-bold tracking-[0.2em] text-[var(--mut)]">
      {text}
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

interface ResolvedStory extends DigestStory {
  items: Item[]; // ids resolved against the cached tabs; [0] = primary
}

// Relative traction of the story's primary item within its own lane.
function tractionRatio(it: Item, tabs: CachedBlob["tabs"]): number {
  const max = Math.max(
    ...(tabs[it.type]?.items ?? []).map((i) => i.tractionScore),
    0.001
  );
  return it.tractionScore / max;
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
  const isNew = story.items.some((it) => visit.isNew(it.firstSeenDate));
  const lead = index === 0;
  return (
    <div
      className={`card-in border-b border-[var(--line)] px-1 py-3.5 ${
        read ? "opacity-55" : ""
      }`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="flex justify-between font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">
        <span>{lead ? "01 · LEAD STORY" : ""}</span>
        {isNew && <span>● NEW</span>}
      </div>
      <div className={`flex gap-2.5 ${lead ? "mt-1.5" : "mt-1"}`}>
        {!lead && (
          <span className="pt-0.5 font-mono text-[12px] font-bold tabular-nums text-[var(--acc)]">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => visit.markOpened(primary.id)}
            className={`block font-serif font-bold leading-snug [text-wrap:balance] ${
              lead ? "text-[22px]" : "text-[15.5px]"
            }`}
          >
            {story.headline}
          </a>
          {story.why && (
            <p
              className={`mt-1 font-serif italic leading-snug text-[var(--mut)] ${
                lead ? "text-[14px]" : "text-[12.5px]"
              }`}
            >
              {story.why}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--mut)]">
            <Meter ratio={tractionRatio(primary, tabs)} />
            <span className="truncate">{topSignalLabel(primary.signals)}</span>
            {story.items.map((it) => {
              const label =
                SOURCE_LABEL[
                  primarySource([...new Set(it.signals.map((s) => s.source))])
                ];
              if (!label) return null;
              return (
                <a
                  key={it.id}
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => visit.markOpened(it.id)}
                  className="shrink-0 font-semibold text-[var(--text)] underline decoration-[var(--acc)] underline-offset-2 opacity-80"
                >
                  {label}
                </a>
              );
            })}
            <span className="ml-auto" />
            <BookmarkButton
              saved={visit.isSaved(primary.id)}
              onToggle={() => visit.toggleSaved(primary)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RadarRow({ item, visit }: { item: Item; visit: Visit }) {
  const isNew = visit.isNew(item.firstSeenDate);
  return (
    <li
      className={`flex items-center gap-2.5 px-1 py-2 ${
        visit.opened.has(item.id) ? "opacity-55" : ""
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${LANE_DOT[item.type]}`}
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
        <span className="shrink-0 font-mono text-[9px] font-bold text-[var(--acc)]">
          ●
        </span>
      )}
      <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-[var(--mut)]">
        {topSignalLabel(item.signals)}
      </span>
      <BookmarkButton
        saved={visit.isSaved(item.id)}
        onToggle={() => visit.toggleSaved(item)}
      />
    </li>
  );
}

export default function Briefing({
  tabs,
  visit,
  digest,
}: {
  tabs: CachedBlob["tabs"];
  visit: Visit;
  digest: { stories: DigestStory[] } | null;
}) {
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

  const radar = useMemo(() => {
    if (!storyMode) return [];
    const seen: string[] = stories.flatMap((s) => [
      norm(s.headline),
      ...s.items.map((it) => norm(it.title)),
    ]);
    const shown = new Set(stories.flatMap((s) => s.items.map((it) => it.id)));
    return SECTIONS.flatMap((s) =>
      pick(
        freshPool(tabs[s.type]?.items ?? [], RADAR_TAKE[s.type]),
        RADAR_TAKE[s.type],
        seen,
        shown
      )
    );
  }, [storyMode, stories, tabs]);

  // Fallback: type-grouped lists when there is no digest to rank stories.
  const fallback = useMemo(() => {
    if (storyMode) return [];
    const seen: string[] = [];
    const shown = new Set<string>();
    return SECTIONS.map((s) => ({
      ...s,
      items: pick(
        freshPool(tabs[s.type]?.items ?? [], s.take),
        s.take,
        seen,
        shown
      ),
    })).filter((s) => s.items.length > 0);
  }, [storyMode, tabs]);

  if (!storyMode && fallback.length === 0)
    return (
      <p className="py-10 text-center font-mono text-[11px] tracking-[0.1em] text-[var(--mut)]">
        NOTHING TO BRIEF YET — RUN THE REFRESH ENDPOINT ONCE (SEE README).
      </p>
    );

  if (storyMode)
    return (
      <div className="mt-1">
        <div className="px-1 pt-2 font-mono text-[9.5px] font-bold tracking-[0.2em] text-[var(--acc)]">
          DAILY BRIEF ·{" "}
          {new Date()
            .toLocaleDateString("en-US", { month: "short", day: "numeric" })
            .toUpperCase()}
        </div>
        <div>
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
            <SectionHeader text="ALSO ON THE RADAR" />
            <ul>
              {radar.map((it) => (
                <RadarRow key={it.id} item={it} visit={visit} />
              ))}
            </ul>
          </>
        )}
      </div>
    );

  return (
    <div className="mt-1">
      {fallback.map((s) => (
        <Fragment key={s.type}>
          <SectionHeader text={s.label.toUpperCase()} />
          <ul>
            {s.items.map((it) => (
              <li
                key={it.id}
                className={`card-in border-b border-[var(--line)] px-1 py-3 ${
                  visit.opened.has(it.id) ? "opacity-55" : ""
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.12em] text-[var(--mut)]">
                  {visit.isNew(it.firstSeenDate) && (
                    <span className="font-bold text-[var(--acc)]">● NEW</span>
                  )}
                  <span className="ml-auto">{relDate(it.firstSeenDate)}</span>
                  <BookmarkButton
                    saved={visit.isSaved(it.id)}
                    onToggle={() => visit.toggleSaved(it)}
                  />
                </div>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => visit.markOpened(it.id)}
                  className="mt-1 block font-serif text-[15px] font-bold leading-snug"
                >
                  {it.title}
                </a>
                <div className="mt-1.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--mut)]">
                  {topSignalLabel(it.signals)}
                </div>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
