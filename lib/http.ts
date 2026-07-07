const DEFAULT_TIMEOUT_MS = 8000;

const UA = "ai-media-radar/1.0 (personal trending-papers PWA)";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  return res.text();
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

// Cut at the last full sentence within max chars so previews read as
// complete thoughts; falls back to a word-boundary ellipsis.
export function sentenceClamp(s: string, max = 220): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastEnd = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? ")
  );
  if (lastEnd > 60) return cut.slice(0, lastEnd + 1);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}
