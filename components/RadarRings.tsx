"use client";

// Three faint concentric hairlines radiating from the masthead — the quiet
// replacement for the old canvas starfield. Pure CSS, ~free to render.
export default function RadarRings() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[-140px] z-0 h-[380px]"
      style={{
        background: [118, 198, 278]
          .map(
            (r) =>
              `radial-gradient(circle at 50% 0%, transparent ${r}px, var(--acc-dim) ${r + 1}px, transparent ${r + 3}px)`
          )
          .join(","),
      }}
    />
  );
}
