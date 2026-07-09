"use client";

import { useState } from "react";
import type { Item, Signal } from "@/lib/types";
import { sentenceClamp } from "@/lib/http";
import { SOURCE_LABEL } from "./theme";

const METRIC_LABELS: Record<string, string> = {
  "hf:upvotes": "HF UPVOTES",
  "hf:comments": "HF COMMENTS",
  "hf:likes": "HF LIKES",
  "hf:downloads": "HF DL",
  "hn:points": "HN PTS",
  "hn:comments": "HN COMMENTS",
  "github:stars": "GH STARS",
  "reddit:score": "REDDIT UPVOTES",
  "reddit:comments": "REDDIT COMMENTS",
};

// The single loudest signal, e.g. "362 HN PTS" — the compact readout used
// where the full breakdown doesn't fit.
export function topSignalLabel(signals: Signal[]): string {
  const top = signals
    .filter((s) => s.value > 0 && `${s.source}:${s.metric}` !== "rss:official")
    .sort((a, b) => b.value - a.value)[0];
  if (!top)
    return signals.some((s) => s.source === "rss") ? "OFFICIAL BLOG" : "";
  return `${fmtCount(top.value)} ${
    METRIC_LABELS[`${top.source}:${top.metric}`] ??
    `${top.source} ${top.metric}`.toUpperCase()
  }`;
}

function whyBreakdown(signals: Signal[], expanded: boolean): string {
  const parts = signals
    .filter((s) => s.value > 0 && `${s.source}:${s.metric}` !== "rss:official")
    .sort((a, b) => b.value - a.value)
    .slice(0, expanded ? 10 : 2)
    .map(
      (s) =>
        `${fmtCount(s.value)} ${METRIC_LABELS[`${s.source}:${s.metric}`] ?? `${s.source} ${s.metric}`.toUpperCase()}`
    );
  if (signals.some((s) => s.source === "rss")) parts.push("OFFICIAL BLOG");
  const sources = new Set(signals.map((s) => s.source)).size;
  if (sources > 1) parts.push(`${sources} SOURCES`);
  return parts.join(" · ");
}

// The signature mark: a 7-segment phosphor meter of relative traction.
export function Meter({ ratio }: { ratio: number }) {
  const filled = Math.max(1, Math.min(7, Math.round(ratio * 7)));
  return (
    <span className="inline-flex shrink-0 items-center gap-[2.5px]">
      {Array.from({ length: 7 }, (_, i) => (
        <i
          key={i}
          className={`h-[9px] w-[4px] rounded-[1px] ${
            i < filled ? "bg-[var(--acc)]" : "bg-[var(--line)]"
          }`}
        />
      ))}
    </span>
  );
}

// Tap target for "save for later" — used on cards, stories, and radar rows.
// Stops propagation so it never expands the card or follows the row link.
export function BookmarkButton({
  saved,
  onToggle,
  className = "",
}: {
  saved: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      aria-label={saved ? "Remove from saved" : "Save for later"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={`-m-1.5 shrink-0 p-1.5 transition-colors ${
        saved ? "text-[var(--acc)]" : "text-[var(--mut)] opacity-60"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}

// Tap target for "annotate this" — pencil, filled accent once a note exists.
export function NoteButton({
  hasNote,
  onClick,
  className = "",
}: {
  hasNote: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      aria-label={hasNote ? "Edit note" : "Add note"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`-m-1.5 shrink-0 p-1.5 transition-colors ${
        hasNote ? "text-[var(--acc)]" : "text-[var(--mut)] opacity-60"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15 17 3.5z" />
        {hasNote && <path d="M14.5 6l3 3" />}
      </svg>
    </button>
  );
}

export default function ItemCard({
  item,
  maxScore,
  index,
  isNew = false,
  isRead = false,
  onOpen,
  isSaved = false,
  onToggleSave,
  note,
  onNote,
}: {
  item: Item;
  maxScore: number;
  index: number;
  isNew?: boolean;
  isRead?: boolean;
  onOpen?: (id: string) => void;
  isSaved?: boolean;
  onToggleSave?: (item: Item) => void;
  note?: string;
  onNote?: (item: Item) => void;
}) {
  // Stagger only the first screenful; later rows appear instantly on scroll.
  const delay = index < 12 ? `${index * 40}ms` : "0ms";
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_LABEL[
    // strongest source string for the meta line
    [...new Set(item.signals.map((s) => s.source))][0] ?? ""
  ];
  // Papers: the author list is preview noise — expanded-only.
  const metaLine = item.type === "paper" ? null : item.authorsOrSource;
  const summary = expanded ? item.summary : sentenceClamp(item.summary, 220);

  return (
    <li
      className={`card-in border-b border-[var(--line)] px-1 py-3.5 transition-opacity ${
        isRead && !expanded ? "opacity-55" : ""
      }`}
      style={{ animationDelay: delay }}
      onClick={() => {
        setExpanded((ex) => !ex);
        if (!expanded) onOpen?.(item.id); // reading the details counts as read
      }}
    >
      <div className="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.12em] text-[var(--mut)]">
        {isNew && <span className="font-bold text-[var(--acc)]">● NEW</span>}
        {metaLine && <span className="truncate normal-case">{metaLine}</span>}
        <span className="ml-auto shrink-0">{relDate(item.firstSeenDate)}</span>
        {onNote && (
          <NoteButton hasNote={!!note} onClick={() => onNote(item)} />
        )}
        {onToggleSave && (
          <BookmarkButton
            saved={isSaved}
            onToggle={() => onToggleSave(item)}
          />
        )}
      </div>

      <h2 className="mt-1.5 font-serif text-[16px] font-bold leading-snug">
        {item.title}
      </h2>

      {summary && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--mut)]">
          {summary}
        </p>
      )}

      {note && (
        <p className="mt-1.5 border-l-2 border-[var(--acc)] pl-2.5 font-serif text-[12.5px] italic leading-relaxed">
          {expanded ? note : sentenceClamp(note, 140)}
        </p>
      )}

      {expanded && item.type === "paper" && item.authorsOrSource && (
        <p className="expand-in mt-2 text-xs text-[var(--mut)]">
          {clampAuthors(item.authorsOrSource)}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2.5 font-mono text-[9.5px] tracking-[0.1em] text-[var(--mut)]">
        <Meter ratio={item.tractionScore / (maxScore || 1)} />
        <span className="truncate">{whyBreakdown(item.signals, expanded)}</span>
        {src && !onToggleSave && <span className="ml-auto">{src}</span>}
      </div>

      {expanded && item.tags.length > 0 && (
        <div className="expand-in mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] tracking-[0.14em] text-[var(--mut)]">
          {item.tags.map((t) => (
            <span key={t}>#{t.toUpperCase()}</span>
          ))}
        </div>
      )}

      {expanded && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.(item.id);
          }}
          className="expand-in mt-3 block w-full rounded-xl border border-[var(--acc)] py-2.5 text-center font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--acc)] transition-transform active:scale-[0.98]"
        >
          OPEN ON {hostLabel(item.url).toUpperCase()} →
        </a>
      )}
    </li>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function clampAuthors(s: string): string {
  const names = s.split(", ");
  if (names.length <= 8) return s;
  return `${names.slice(0, 8).join(", ")} +${names.length - 8} more`;
}

export function relDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return "TODAY";
  if (days === 1) return "1D";
  return `${days}D`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
