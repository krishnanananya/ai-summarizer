"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "model";
  text: string;
}

const SUGGESTIONS = [
  "What's the biggest paper this week?",
  "Summarize today's AI news",
  "What's moving on the LLM leaderboard?",
];

// Snap le Chat, the mascot: a line-drawn cat head — pointed ears part of the
// silhouette, triangle nose, split mouth, whiskers. When animated, the tail
// swishes and the eyes blink (keyframes in globals.css).
function CatIcon({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* tail */}
      <path
        className={animated ? "cat-tail" : undefined}
        d="M18.3 18.3c2.5 1.5 4.5.2 3.9-2.5"
      />
      {/* head silhouette, ears included */}
      <path d="M12 4.6c1.4 0 2.7.3 3.8 1L18.4 3l.5 4.3c.9 1.3 1.4 2.8 1.4 4.4 0 4.5-3.7 7.6-8.3 7.6s-8.3-3.1-8.3-7.6c0-1.6.5-3.1 1.4-4.4L5.6 3l2.6 2.6c1.1-.7 2.4-1 3.8-1z" />
      {/* inner ears */}
      <path d="M6.4 5.1l1 1M17.6 5.1l-1 1" />
      {/* whiskers */}
      <path d="M2.2 12.6l3-.2M2.8 15.4l2.8-1M21.8 12.6l-3-.2M21.2 15.4l-2.8-1" />
      {/* eyes */}
      <g
        className={animated ? "cat-eyes" : undefined}
        fill="currentColor"
        stroke="none"
      >
        <circle cx="9.2" cy="11.4" r="1.05" />
        <circle cx="14.8" cy="11.4" r="1.05" />
      </g>
      {/* nose */}
      <path d="M11.2 13.6h1.6L12 14.9z" fill="currentColor" stroke="none" />
      {/* mouth: down from nose, then a split curve each side */}
      <path d="M12 14.9v.8M12 15.7c-.4.8-1.5.9-2 .2M12 15.7c.4.8 1.5.9 2 .2" />
    </svg>
  );
}

// Bottom sheet, opened from the CHAT tab. Controlled by the parent; stays
// mounted after first open so the conversation survives closing it.
export default function ChatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Lock the page behind the sheet while it's open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const history: Msg[] = [...messages, { role: "user", text }];
    setMessages([...history, { role: "model", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...history, { role: "model", text: acc }]);
      }
      if (!acc.trim()) throw new Error("The model returned nothing — try again.");
    } catch (e) {
      setMessages(history);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-30 ${open ? "" : "pointer-events-none"}`}>
      {/* Backdrop — tap to close */}
      <div
        onClick={() => onOpenChange(false)}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-xl flex-col border-[var(--line)] bg-[var(--bg)] transition-all duration-300 ease-out ${
          expanded
            ? "h-[100dvh] rounded-none border-0"
            : "h-[55dvh] rounded-t-3xl border border-b-0"
        } ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        {/* Header: handle + title + expand/close */}
        <div
          className={`flex items-center gap-2 px-4 pb-2 ${
            expanded ? "pt-[max(0.75rem,env(safe-area-inset-top))]" : "pt-2"
          }`}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="absolute left-1/2 top-2 -translate-x-1/2 p-2"
          >
            <span className="block h-1 w-10 rounded-full bg-[var(--line)]" />
          </button>
          <h2 className="mt-3 flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.16em] text-[var(--acc)]">
            <CatIcon animated className="h-5 w-5" />
            SNAP LE CHAT
          </h2>
          <div className="ml-auto mt-3 flex gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse" : "Expand"}
              className="rounded-lg p-1.5 text-[var(--mut)] active:text-[var(--text)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {expanded ? (
                  <path d="M4 14h6v6M20 10h-6V4" />
                ) : (
                  <path d="M4 10V4h6M20 14v6h-6" />
                )}
              </svg>
            </button>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-[var(--mut)] active:text-[var(--text)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3">
          {messages.length === 0 && (
            <div className="px-2 pt-6 text-center">
              <CatIcon className="mx-auto mb-3 h-10 w-10 text-[var(--mut)] opacity-50" />
              <p className="text-sm text-[var(--mut)]">
                Hi, I&apos;m Snap le Chat. Ask me about what&apos;s trending in
                AI — papers, models, leaderboard moves, news.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-[var(--line)] px-3 py-2 text-[12.5px] font-medium text-[var(--text)] transition-all active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="space-y-2.5 py-2">
            {messages.map((m, i) => (
              <li
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex"}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-[var(--acc-dim)] text-[var(--text)]"
                      : "border border-[var(--line)] bg-[var(--panel)] text-[var(--text)]"
                  }`}
                >
                  {m.text ||
                    (busy && i === messages.length - 1 ? (
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--mut)]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--mut)] [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--mut)] [animation-delay:240ms]" />
                      </span>
                    ) : null)}
                </div>
              </li>
            ))}
          </ul>
          {error && (
            <p className="pb-2 text-center text-xs text-[var(--alert)]">
              {error}
            </p>
          )}
        </div>

        {/* Input */}
        <form
          className="flex gap-2 border-t border-[var(--line)] px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Snap…"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none placeholder:text-[var(--mut)] focus:border-[var(--acc)]"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl border border-[var(--acc)] px-3.5 py-2 font-mono text-sm font-bold text-[var(--acc)] transition-all active:scale-95 disabled:opacity-40"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
