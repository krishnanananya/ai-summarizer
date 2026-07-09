"use client";

import { useState } from "react";
import type { Visit } from "@/lib/visit";
import { BookmarkButton } from "./ItemCard";
import { LANE_DOT } from "./theme";

// The Saved mode: bookmarked items as a reading list, newest first.
// Entries are snapshots, so they outlive the feed windows that surfaced
// them. Filter lanes: everything / papers / the rest.
type Filter = "all" | "papers" | "articles";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "papers", label: "PAPERS" },
  { id: "articles", label: "ARTICLES" },
];

function savedDate(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400_000);
  if (days <= 0) return "SAVED TODAY";
  if (days === 1) return "SAVED YESTERDAY";
  if (days < 7)
    return `SAVED ${new Date(ms).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}`;
  return `SAVED ${new Date(ms)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase()}`;
}

export default function SavedList({ visit }: { visit: Visit }) {
  const [filter, setFilter] = useState<Filter>("all");

  const items = visit.saved.filter((s) =>
    filter === "all"
      ? true
      : filter === "papers"
        ? s.type === "paper"
        : s.type !== "paper"
  );

  return (
    <div className="mt-1">
      <div className="flex gap-5 border-b border-[var(--line)] px-1 pt-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`relative pb-2.5 font-mono text-[10.5px] tracking-[0.16em] ${
              filter === f.id
                ? "font-bold text-[var(--text)]"
                : "text-[var(--mut)]"
            }`}
          >
            {f.label}
            {filter === f.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--acc)]" />
            )}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="font-serif text-[15px] font-bold">
            Nothing saved{filter === "all" ? " yet" : " here"}.
          </p>
          <p className="mt-2 text-[12.5px] text-[var(--mut)]">
            Tap the bookmark on any story or feed item to build your reading
            list. Saved links stay even after they leave the feeds.
          </p>
        </div>
      ) : (
        <ul>
          {items.map((s, i) => (
            <li
              key={s.id}
              className={`card-in border-b border-[var(--line)] px-1 py-3 ${
                visit.opened.has(s.id) ? "opacity-55" : ""
              }`}
              style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
            >
              <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.14em] text-[var(--mut)]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${LANE_DOT[s.type]}`}
                />
                <span>
                  {savedDate(s.savedAt)} · {s.type.toUpperCase()}
                </span>
                <span className="ml-auto" />
                <BookmarkButton saved onToggle={() => visit.toggleSaved(s)} />
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => visit.markOpened(s.id)}
                className="mt-1 block font-serif text-[15px] font-bold leading-snug"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
