import type { Item } from "./types";

// The editorial watchlist: which organizations' news is automatically
// important. Used two ways — client-side as the frontier-lab filter chips,
// and server-side to guarantee watchlist items reach the digest model
// regardless of traction (a release announced an hour ago has no points
// yet, but it is exactly what the daily brief must not miss).
//
// To tune what gets auto-flagged, edit these regexes (they run over
// title + summary + source + url) or RELEASE_RE below.
export interface Lab {
  id: string;
  label: string;
  re: RegExp;
}

export const LABS: Lab[] = [
  { id: "openai", label: "OpenAI", re: /openai|\bgpt-?\d|chatgpt|\bcodex\b|\bsora\b|\bsol\b|\bterra\b|\bluna\b/i },
  { id: "anthropic", label: "Anthropic", re: /anthropic|claude|\bfable\b|\bmythos\b|\bopus\b|\bsonnet\b|\bhaiku\b/i },
  { id: "google", label: "Google", re: /google|gemini|deepmind|\bgemma\b/i },
  { id: "meta", label: "Meta", re: /\bmeta\b|\bllama\b|zuckerberg|\bmuse\b/i },
  { id: "xai", label: "xAI", re: /\bxai\b|\bgrok\b/i },
  { id: "deepseek", label: "DeepSeek", re: /deepseek/i },
  { id: "qwen", label: "Qwen", re: /\bqwen|alibaba/i },
  { id: "mistral", label: "Mistral", re: /mistral/i },
];

// "Release-shaped" language: new availability, not commentary about a lab.
const RELEASE_RE =
  /\b(releas\w*|launch\w*|announc\w*|introduc\w*|unveil\w*|ships?|shipping|now available|available (today|now)|previews?|weights|open[- ]?sourc\w*|debuts?|new model)\b/i;

export function labMatch(
  it: Pick<Item, "title" | "summary" | "authorsOrSource" | "url">
): Lab | null {
  const hay = `${it.title} ${it.summary} ${it.authorsOrSource} ${it.url}`;
  return LABS.find((l) => l.re.test(hay)) ?? null;
}

// Watchlist flag: a frontier-lab item that reads like a release or
// announcement (any lab-matching model repo counts — new weights ARE the
// announcement). These are force-included as digest candidates.
export function isWatchlisted(it: Item): boolean {
  const lab = labMatch(it);
  if (!lab) return false;
  if (it.type === "model") return true;
  return RELEASE_RE.test(`${it.title} ${it.summary}`);
}
