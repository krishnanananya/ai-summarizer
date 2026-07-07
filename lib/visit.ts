"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item, ItemType } from "./types";

// "Since last visit" tracking, all client-side in localStorage.
//
// A "visit" is a burst of activity: reloading twice in a row must not move
// the boundary, so the boundary only advances when the user returns after
// SESSION_GAP of inactivity — at that moment the previous session's last
// activity time becomes the new boundary. Items whose firstSeenDate is after
// the boundary are "new to you". markCaughtUp advances the boundary
// explicitly ("I've seen everything") without waiting out the gap.
const SESSION_GAP_MS = 30 * 60_000;
const K_LAST_ACTIVE = "radar:lastActiveAt";
const K_BOUNDARY = "radar:visitBoundary";
const K_OPENED = "radar:openedIds";
const K_SAVED = "radar:savedItems";
const OPENED_CAP = 600; // oldest ids fall off; feeds only hold ~150/tab
const SAVED_CAP = 100;

// Read-later entries are snapshots, not ids: feed items age out of their
// windows, and a saved link must outlive the feed that surfaced it.
export interface SavedItem {
  id: string;
  type: ItemType;
  title: string;
  url: string;
  savedAt: number;
}

export interface Visit {
  /** ms timestamp of the previous visit's end, or null on first ever visit */
  boundary: number | null;
  isNew: (firstSeenIso: string) => boolean;
  opened: Set<string>;
  markOpened: (id: string) => void;
  /** Advance the boundary to now — clears every "new" badge. */
  markCaughtUp: () => void;
  saved: SavedItem[];
  isSaved: (id: string) => boolean;
  toggleSaved: (item: Pick<Item, "id" | "type" | "title" | "url">) => void;
}

export function useVisit(): Visit {
  const [boundary, setBoundary] = useState<number | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<SavedItem[]>([]);

  useEffect(() => {
    try {
      const now = Date.now();
      const lastActive = Number(localStorage.getItem(K_LAST_ACTIVE)) || 0;
      let b = Number(localStorage.getItem(K_BOUNDARY)) || 0;
      if (!lastActive || now - lastActive > SESSION_GAP_MS) {
        b = lastActive;
        localStorage.setItem(K_BOUNDARY, String(b));
      }
      localStorage.setItem(K_LAST_ACTIVE, String(now));
      setBoundary(b || null);

      const raw = localStorage.getItem(K_OPENED);
      if (raw) setOpened(new Set(JSON.parse(raw) as string[]));
      const rawSaved = localStorage.getItem(K_SAVED);
      if (rawSaved) setSaved(JSON.parse(rawSaved) as SavedItem[]);

      // Keep "last active" fresh while the tab stays open, so stepping away
      // for a day and coming back counts as a fresh visit.
      const touch = () => localStorage.setItem(K_LAST_ACTIVE, String(Date.now()));
      window.addEventListener("focus", touch);
      const iv = setInterval(touch, 60_000);
      return () => {
        window.removeEventListener("focus", touch);
        clearInterval(iv);
      };
    } catch {
      /* localStorage unavailable (private mode) — feature degrades to off */
    }
  }, []);

  const markOpened = useCallback((id: string) => {
    setOpened((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          K_OPENED,
          JSON.stringify([...next].slice(-OPENED_CAP))
        );
      } catch {
        /* ignore quota/private-mode errors */
      }
      return next;
    });
  }, []);

  const markCaughtUp = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(K_BOUNDARY, String(now));
      localStorage.setItem(K_LAST_ACTIVE, String(now));
    } catch {
      /* ignore */
    }
    setBoundary(now);
  }, []);

  const toggleSaved = useCallback(
    (item: Pick<Item, "id" | "type" | "title" | "url">) => {
      setSaved((prev) => {
        const next = prev.some((s) => s.id === item.id)
          ? prev.filter((s) => s.id !== item.id)
          : [
              {
                id: item.id,
                type: item.type,
                title: item.title,
                url: item.url,
                savedAt: Date.now(),
              },
              ...prev,
            ].slice(0, SAVED_CAP);
        try {
          localStorage.setItem(K_SAVED, JSON.stringify(next));
        } catch {
          /* ignore quota/private-mode errors */
        }
        return next;
      });
    },
    []
  );

  const isSaved = useCallback(
    (id: string) => saved.some((s) => s.id === id),
    [saved]
  );

  const isNew = useCallback(
    (firstSeenIso: string) =>
      boundary != null && new Date(firstSeenIso).getTime() > boundary,
    [boundary]
  );

  return {
    boundary,
    isNew,
    opened,
    markOpened,
    markCaughtUp,
    saved,
    isSaved,
    toggleSaved,
  };
}
