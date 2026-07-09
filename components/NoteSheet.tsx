"use client";

import { useEffect, useRef, useState } from "react";
import type { Item } from "@/lib/types";

export type NoteTarget = Pick<Item, "id" | "type" | "title" | "url">;

// Bottom sheet for annotating an item — why it caught your eye, what to check
// later. Rendered only while a target is set; SAVE commits (empty deletes),
// backdrop or × discards. Notes persist via lib/visit.ts.
export default function NoteSheet({
  target,
  initial,
  onSave,
  onClose,
}: {
  target: NoteTarget;
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />

      <div className="expand-in absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl border border-b-0 border-[var(--line)] bg-[var(--bg)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] font-bold tracking-[0.16em] text-[var(--acc)]">
              {initial ? "EDIT NOTE" : "ADD NOTE"}
            </p>
            <p className="mt-1 truncate font-serif text-[13px] font-bold leading-snug">
              {target.title}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close note"
            className="ml-auto rounded-lg p-1.5 text-[var(--mut)] active:text-[var(--text)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Why does this matter to you?"
          className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 font-serif text-[14px] italic leading-relaxed outline-none placeholder:text-[var(--mut)] focus:border-[var(--acc)]"
        />

        <div className="mt-2 flex items-center gap-2">
          {initial && (
            <button
              onClick={() => onSave("")}
              className="rounded-xl border border-[var(--line)] px-3.5 py-2 font-mono text-[10.5px] font-bold tracking-[0.12em] text-[var(--alert)] transition-all active:scale-95"
            >
              DELETE
            </button>
          )}
          <button
            onClick={() => onSave(text)}
            disabled={text.trim() === initial}
            className="ml-auto rounded-xl border border-[var(--acc)] px-5 py-2 font-mono text-[10.5px] font-bold tracking-[0.12em] text-[var(--acc)] transition-all active:scale-95 disabled:opacity-40"
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
