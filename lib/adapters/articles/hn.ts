import type { Adapter, RawItem } from "../../types";
import { fetchJson, truncate } from "../../http";
import { normalizeUrl, isAiRelevant, extractTags, arxivIdFromUrl } from "../../normalize";
import { CONFIG } from "../../config";

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at_i: number;
  story_text?: string | null;
}

// Hacker News via Algolia (free, no auth). Pull top stories in the window,
// keyword-filter to AI/ML; arXiv links belong to the Papers tab, skip them.
export const hn: Adapter = async () => {
  const since = Math.floor(
    Date.now() / 1000 - CONFIG.article.windowDays * 86400
  );
  // Algolia only allows numeric filters on created_at_i; filter points client-side.
  const data = await fetchJson<{ hits: HnHit[] }>(
    `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i%3E${since}&hitsPerPage=500`
  );
  const items: RawItem[] = [];
  for (const h of data.hits ?? []) {
    if (!h.url || !h.title) continue;
    if ((h.points ?? 0) < 10) continue;
    if (arxivIdFromUrl(h.url)) continue;
    if (!isAiRelevant(`${h.title} ${h.url}`)) continue;
    items.push({
      id: normalizeUrl(h.url),
      type: "article",
      title: h.title,
      url: h.url,
      authorsOrSource: new URL(h.url).hostname.replace(/^www\./, ""),
      summary: truncate(cleanStoryText(h.story_text ?? ""), 400),
      firstSeenDate: new Date(h.created_at_i * 1000).toISOString(),
      signals: [
        { source: "hn", metric: "points", value: h.points ?? 0 },
        { source: "hn", metric: "comments", value: h.num_comments ?? 0 },
      ],
      tags: extractTags(h.title),
    });
  }
  return { source: "hacker-news", items };
};

// story_text arrives as HTML with entity-escaped attributes; render as prose.
function cleanStoryText(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/https?:\/\/\S+/g, "") // bare pasted links read as noise
    .replace(/\s+/g, " ")
    .trim();
}
