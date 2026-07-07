"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject, TouchEvent } from "react";

// Swipe-to-navigate between tabs: the content pane follows the finger
// (with resistance at the ends), then either springs back or commits —
// sliding out, switching tab, and sliding the new pane in from the other
// side. `xShift` broadcasts the live drag offset so the galaxy background
// can parallax with the gesture.
export function useSwipeNav<T extends string>({
  order,
  active,
  onCommit,
  xShift,
}: {
  order: T[];
  active: T;
  onCommit: (t: T) => void;
  xShift: MutableRefObject<number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef({
    startX: 0,
    startY: 0,
    dx: 0,
    axis: "" as "" | "h" | "v",
    lastX: 0,
    lastT: 0,
    vx: 0,
    animating: false,
    resisted: false,
  });
  // Keep current tab index in a ref so the touch handlers never go stale.
  const idxRef = useRef(0);
  idxRef.current = order.indexOf(active);

  useEffect(() => {
    return () => {
      xShift.current = 0;
    };
  }, [xShift]);

  const reduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Drags that start inside a horizontally scrollable child (e.g. the LLM
  // leaderboard table) belong to that child.
  const insideHScroller = (target: EventTarget | null): boolean => {
    let el = target as HTMLElement | null;
    while (el && el !== ref.current) {
      if (el.scrollWidth - el.clientWidth > 4) {
        const ox = getComputedStyle(el).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      el = el.parentElement;
    }
    return false;
  };

  const setX = (dx: number, transition = "none") => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = dx ? `translateX(${dx}px)` : "";
    el.style.opacity = dx
      ? String(Math.max(0.4, 1 - Math.abs(dx) / (el.clientWidth * 1.4)))
      : "";
  };

  const onTouchStart = (e: TouchEvent) => {
    if (g.current.animating || e.touches.length !== 1) return;
    if (insideHScroller(e.target)) return;
    const t = e.touches[0];
    g.current = {
      ...g.current,
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      axis: "",
      lastX: t.clientX,
      lastT: e.timeStamp,
      vx: 0,
    };
  };

  const onTouchMove = (e: TouchEvent) => {
    const s = g.current;
    if (s.animating || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    }
    if (s.axis !== "h") return;
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) s.vx = (t.clientX - s.lastX) / dt;
    s.lastX = t.clientX;
    s.lastT = e.timeStamp;
    const idx = idxRef.current;
    const noNeighbor =
      (dx > 0 && idx <= 0) || (dx < 0 && idx >= order.length - 1);
    s.resisted = noNeighbor;
    s.dx = noNeighbor ? dx * 0.3 : dx;
    if (!reduced()) {
      setX(s.dx);
      xShift.current = s.dx;
    }
  };

  const onTouchEnd = () => {
    const s = g.current;
    if (s.animating || s.axis !== "h") {
      s.axis = "";
      return;
    }
    s.axis = "";
    const el = ref.current;
    const idx = idxRef.current;
    const w = el?.clientWidth ?? 360;
    const dir = s.dx > 0 ? -1 : 1; // finger right → previous tab
    const next = order[idx + dir];
    const flick = Math.abs(s.vx) > 0.45 && Math.abs(s.dx) > 24;
    const far = Math.abs(s.dx) > w * 0.3;
    const commit = !s.resisted && next != null && (far || flick);

    if (!commit) {
      // Spring back.
      setX(0, "transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease");
      xShift.current = 0;
      s.dx = 0;
      return;
    }

    if (reduced()) {
      onCommit(next);
      s.dx = 0;
      return;
    }

    s.animating = true;
    // Slide the old pane out…
    setX(-dir * w * 0.55, "transform 0.15s ease-in, opacity 0.15s ease-in");
    xShift.current = -dir * w * 0.6;
    window.setTimeout(() => {
      onCommit(next);
      // …place the new pane just off-screen on the far side…
      setX(dir * w * 0.45);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // …and ease it home.
          setX(
            0,
            "transform 0.34s cubic-bezier(0.16,1,0.3,1), opacity 0.34s ease-out"
          );
          xShift.current = 0;
          window.setTimeout(() => {
            const el2 = ref.current;
            if (el2) el2.style.transition = "";
            s.animating = false;
            s.dx = 0;
          }, 360);
        })
      );
    }, 150);
  };

  return { ref, onTouchStart, onTouchMove, onTouchEnd };
}
