"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

// Ambient galaxy layer behind the feed: drifting star field with scroll
// parallax, slow nebula glows, radar pings, and the odd shooting star.
// The accent hue follows the active tab and crossfades between switches.
// `xShift` (live px offset from the tab-swipe gesture) pans the field
// horizontally with depth, so swiping feels like steering through space.

interface Star {
  x: number;
  y: number; // position within the tall wrapping field, in CSS px
  z: number; // depth 0..1 — drives parallax speed and size
  r: number;
  base: number; // base alpha
  phase: number;
  speed: number; // twinkle rate
  tinted: boolean; // accent-coloured instead of neutral
}

interface Ping {
  x: number;
  y: number;
  born: number;
}

interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function GalaxyBackground({
  accent,
  xShift,
}: {
  accent: string;
  xShift?: MutableRefObject<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(hexToRgb(accent));
  // Read through a ref so the canvas effect ([] deps) never goes stale.
  const xShiftRef = useRef(xShift);
  xShiftRef.current = xShift;

  useEffect(() => {
    target.current = hexToRgb(accent);
  }, [accent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const darkMq = window.matchMedia("(prefers-color-scheme: dark)");

    let W = 0;
    let H = 0;
    let fieldH = 0;
    let stars: Star[] = [];
    const pings: Ping[] = [];
    const streaks: Streak[] = [];
    // Current accent, lerped toward target for smooth tab crossfades.
    const cur = [...target.current] as [number, number, number];
    // Smoothed horizontal pan from the tab-swipe gesture.
    let panX = 0;
    let raf = 0;
    let running = false;
    let nextPing = performance.now() + 1800;
    let nextStreak = performance.now() + 6000;

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      fieldH = H * 1.6;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(150, Math.round((W * H) / 7000));
      stars = Array.from({ length: count }, () => {
        const z = Math.random();
        return {
          x: Math.random() * W,
          y: Math.random() * fieldH,
          z,
          r: 0.4 + z * 1.1 + (Math.random() < 0.06 ? 0.8 : 0),
          base: 0.25 + z * 0.55,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 1.4,
          tinted: Math.random() < 0.28,
        };
      });
    };

    const starY = (s: Star, scrollY: number) => {
      // Deeper (higher z) stars scroll faster — cheap parallax.
      const y = (s.y - scrollY * (0.1 + s.z * 0.3)) % fieldH;
      return (y < 0 ? y + fieldH : y) - (fieldH - H) / 2;
    };

    const draw = (now: number) => {
      const t = now / 1000;
      const dark = darkMq.matches;
      const scrollY = window.scrollY;
      const anim = !reduced.matches;

      for (let i = 0; i < 3; i++)
        cur[i] += (target.current[i] - cur[i]) * (anim ? 0.06 : 1);
      const [ar, ag, ab] = cur.map(Math.round);
      panX += ((xShiftRef.current?.current ?? 0) - panX) * (anim ? 0.18 : 1);

      ctx.clearRect(0, 0, W, H);

      // Nebula glows: two large accent-tinted radial gradients drifting slowly.
      const nebulaAlpha = dark ? 0.085 : 0.05;
      for (let i = 0; i < 2; i++) {
        const ph = i * 2.4;
        const nx =
          W * (0.25 + 0.5 * i) +
          Math.sin(t * 0.05 + ph) * W * 0.18 +
          panX * 0.08;
        const ny =
          H * (0.3 + 0.45 * i) +
          Math.cos(t * 0.04 + ph) * H * 0.15 -
          scrollY * 0.05;
        const nr = Math.min(W, H) * (0.55 + 0.15 * i);
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        g.addColorStop(0, `rgba(${ar},${ag},${ab},${nebulaAlpha})`);
        g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Stars — deeper (higher z) stars pan more with the swipe gesture.
      for (const s of stars) {
        if (anim) s.x = (s.x + 0.008 + s.z * 0.012 + W) % W;
        const y = starY(s, scrollY);
        if (y < -4 || y > H + 4) continue;
        const x = (((s.x + panX * (0.12 + s.z * 0.38)) % W) + W) % W;
        const tw = anim ? 0.65 + 0.35 * Math.sin(t * s.speed + s.phase) : 0.85;
        const alpha = s.base * tw * (dark ? 1 : 0.55);
        ctx.fillStyle = s.tinted
          ? `rgba(${ar},${ag},${ab},${alpha})`
          : dark
            ? `rgba(226,232,240,${alpha})`
            : `rgba(82,82,101,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (anim) {
        // Radar pings: expanding rings born on random tinted stars.
        if (now > nextPing && stars.length) {
          const s = stars[(Math.random() * stars.length) | 0];
          pings.push({ x: s.x, y: starY(s, scrollY), born: now });
          nextPing = now + 2200 + Math.random() * 2600;
        }
        for (let i = pings.length - 1; i >= 0; i--) {
          const p = pings[i];
          const age = (now - p.born) / 1900;
          if (age >= 1) {
            pings.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(1 - age) * (dark ? 0.5 : 0.35)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 + age * 52, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Shooting stars: rare quick streaks across the top half.
        if (now > nextStreak) {
          const fromLeft = Math.random() < 0.5;
          streaks.push({
            x: fromLeft ? -20 : W + 20,
            y: Math.random() * H * 0.45,
            vx: (fromLeft ? 1 : -1) * (7 + Math.random() * 4),
            vy: 1.6 + Math.random() * 1.6,
            born: now,
          });
          nextStreak = now + 9000 + Math.random() * 14000;
        }
        for (let i = streaks.length - 1; i >= 0; i--) {
          const st = streaks[i];
          st.x += st.vx;
          st.y += st.vy;
          const age = (now - st.born) / 1200;
          if (age >= 1 || st.x < -60 || st.x > W + 60) {
            streaks.splice(i, 1);
            continue;
          }
          const a = Math.sin(age * Math.PI) * (dark ? 0.8 : 0.5);
          const grad = ctx.createLinearGradient(
            st.x - st.vx * 7,
            st.y - st.vy * 7,
            st.x,
            st.y
          );
          grad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
          grad.addColorStop(
            1,
            dark ? `rgba(240,245,255,${a})` : `rgba(${ar},${ag},${ab},${a})`
          );
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(st.x - st.vx * 7, st.y - st.vy * 7);
          ctx.lineTo(st.x, st.y);
          ctx.stroke();
        }
      }
    };

    const loop = (now: number) => {
      draw(now);
      if (running) raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || reduced.matches || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onResize = () => {
      seed();
      if (!running) draw(performance.now());
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const onMotionPref = () => {
      stop();
      if (reduced.matches) draw(performance.now());
      else start();
    };

    seed();
    if (reduced.matches) draw(performance.now());
    else start();

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotionPref);
    darkMq.addEventListener("change", onResize);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotionPref);
      darkMq.removeEventListener("change", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
