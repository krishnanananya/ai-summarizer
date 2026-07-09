"use client";

import { useEffect, useRef, useState } from "react";

// The ⋯ menu in the masthead: theme switcher (Auto / Light / Dark).
// Preference persists in localStorage and is applied before first paint by
// the inline script in app/layout.tsx; "auto" tracks the OS live.
type Pref = "auto" | "light" | "dark";
const KEY = "radar:theme";

function apply(pref: Pref) {
  const dark =
    pref === "dark" ||
    (pref === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<Pref>("auto");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Pref | null;
      if (stored === "light" || stored === "dark") setPref(stored);
    } catch {
      /* private mode — stays auto */
    }
  }, []);

  // While on auto, follow OS theme changes live.
  useEffect(() => {
    if (pref !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (p: Pref) => {
    setPref(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
    apply(p);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Settings"
        onClick={() => setOpen((o) => !o)}
        className="-m-1 p-1 font-mono text-[14px] font-bold leading-none text-[var(--mut)] active:text-[var(--text)]"
      >
        ⋯
      </button>
      {open && (
        <div className="expand-in absolute right-0 top-6 z-30 w-32 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg">
          {(
            [
              ["auto", "AUTO"],
              ["light", "LIGHT"],
              ["dark", "DARK"],
            ] as [Pref, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => choose(p)}
              className={`flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] tracking-[0.14em] ${
                pref === p ? "text-[var(--acc)]" : "text-[var(--mut)]"
              }`}
            >
              {label}
              {pref === p && <span>●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
