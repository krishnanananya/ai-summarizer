"use client";

import { useState } from "react";
import type { Item, Signal } from "@/lib/types";
import { sentenceClamp } from "@/lib/http";
import { SOURCE_THEME, TYPE_THEME, primarySource } from "./theme";

const METRIC_LABELS: Record<string, string> = {
  "hf:upvotes": "HF upvotes",
  "hf:comments": "HF comments",
  "hf:likes": "HF likes",
  "hf:downloads": "HF downloads",
  "hn:points": "HN points",
  "hn:comments": "HN comments",
  "github:stars": "GitHub stars",
  "reddit:score": "Reddit upvotes",
  "reddit:comments": "Reddit comments",
};

// The single loudest signal, e.g. "362 HN points" — used by the compact
// briefing tiles where the full breakdown doesn't fit.
export function topSignalLabel(signals: Signal[]): string {
  const top = signals
    .filter((s) => s.value > 0 && `${s.source}:${s.metric}` !== "rss:official")
    .sort((a, b) => b.value - a.value)[0];
  if (!top)
    return signals.some((s) => s.source === "rss") ? "official blog" : "";
  return `${fmtCount(top.value)} ${
    METRIC_LABELS[`${top.source}:${top.metric}`] ??
    `${top.source} ${top.metric}`
  }`;
}

function whyBreakdown(signals: Signal[], expanded: boolean): string {
  const parts = signals
    .filter((s) => s.value > 0 && `${s.source}:${s.metric}` !== "rss:official")
    .sort((a, b) => b.value - a.value)
    .slice(0, expanded ? 10 : 2)
    .map(
      (s) =>
        `${fmtCount(s.value)} ${METRIC_LABELS[`${s.source}:${s.metric}`] ?? `${s.source} ${s.metric}`}`
    );
  if (signals.some((s) => s.source === "rss")) parts.push("official blog");
  const sources = new Set(signals.map((s) => s.source)).size;
  if (sources > 1) parts.push(`${sources} sources`);
  return parts.join(" · ");
}

// Tap target for "save for later" — used on cards and briefing tiles. Stops
// propagation so it never expands the card or follows the tile link.
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
        saved
          ? "text-violet-500"
          : "text-zinc-300 active:text-zinc-500 dark:text-zinc-700 dark:active:text-zinc-500"
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

export default function ItemCard({
  item,
  maxScore,
  index,
  isNew = false,
  isRead = false,
  onOpen,
  isSaved = false,
  onToggleSave,
}: {
  item: Item;
  maxScore: number;
  index: number;
  isNew?: boolean;
  isRead?: boolean;
  onOpen?: (id: string) => void;
  isSaved?: boolean;
  onToggleSave?: (item: Item) => void;
}) {
  // Stagger only the first screenful; later cards appear instantly on scroll.
  const delay = index < 12 ? `${index * 45}ms` : "0ms";
  const [expanded, setExpanded] = useState(false);
  const theme = TYPE_THEME[item.type];
  const src = primarySource([...new Set(item.signals.map((s) => s.source))]);
  const srcTheme = SOURCE_THEME[src];
  // Papers: the author list is preview noise — expanded-only.
  const metaLine = item.type === "paper" ? null : item.authorsOrSource;
  const summary = expanded ? item.summary : sentenceClamp(item.summary, 220);

  return (
    <li
      className={`card-in rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm transition-[background-color,transform,opacity] active:scale-[0.99] active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/85 dark:active:bg-zinc-800/70 ${
        isRead && !expanded ? "opacity-60" : ""
      }`}
      style={{ animationDelay: delay }}
      onClick={() => {
        setExpanded((ex) => !ex);
        if (!expanded) onOpen?.(item.id); // reading the details counts as read
      }}
    >
      <div className="flex items-center gap-2 text-[11px]">
        {srcTheme && (
          <span
            className={`rounded-md px-1.5 py-0.5 font-semibold ${srcTheme.chip}`}
          >
            {srcTheme.label}
          </span>
        )}
        {metaLine && (
          <span className="truncate text-zinc-500">{metaLine}</span>
        )}
        <span className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500">
          {isNew && (
            <span className={`mr-1.5 font-bold ${theme.text}`}>new</span>
          )}
          {relDate(item.firstSeenDate)}
        </span>
        {onToggleSave && (
          <BookmarkButton
            saved={isSaved}
            onToggle={() => onToggleSave(item)}
          />
        )}
      </div>

      <h2 className="mt-1.5 text-[15px] font-semibold leading-snug">
        {item.title}
      </h2>

      {summary && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          {summary}
        </p>
      )}

      {expanded && item.type === "paper" && item.authorsOrSource && (
        <p className="expand-in mt-2 text-xs text-zinc-500">
          {clampAuthors(item.authorsOrSource)}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`bar-grow h-full rounded-full ${theme.bar}`}
            style={{
              width: `${Math.max(6, (item.tractionScore / (maxScore || 1)) * 100)}%`,
              animationDelay: delay,
            }}
          />
        </div>
        <span className="truncate text-[11px] text-zinc-500">
          {whyBreakdown(item.signals, expanded)}
        </span>
      </div>

      {(item.tags.length > 0 || expanded) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {item.tags.map((t) => (
            <span
              key={t}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${theme.softBg} ${theme.text}`}
            >
              {t}
            </span>
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
          className={`expand-in mt-3 block w-full rounded-xl py-2.5 text-center text-sm font-semibold text-white transition-transform active:scale-[0.98] ${theme.bar}`}
        >
          Open {srcTheme ? `on ${hostLabel(item.url)}` : ""}
        </a>
      )}
    </li>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function clampAuthors(s: string): string {
  const names = s.split(", ");
  if (names.length <= 8) return s;
  return `${names.slice(0, 8).join(", ")} +${names.length - 8} more`;
}

export function relDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
