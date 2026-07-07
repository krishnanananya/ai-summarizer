import type { Adapter, RawItem } from "../../types";
import { fetchRedditPosts } from "../shared/reddit";
import { normalizeUrl, arxivIdFromUrl, extractTags } from "../../normalize";
import { truncate } from "../../http";

// Reddit link posts pointing at NON-arXiv URLs (blogs, news, company posts).
export const redditLinks: Adapter = async () => {
  const posts = await fetchRedditPosts([
    "MachineLearning",
    "LocalLLaMA",
    "artificial",
  ]);
  const items: RawItem[] = [];
  for (const p of posts) {
    if (p.is_self || !p.url) continue;
    if (arxivIdFromUrl(p.url)) continue;
    // Skip Reddit-internal media/crossposts — not articles.
    if (/(^|\.)(reddit\.com|redd\.it)$/i.test(safeHost(p.url))) continue;
    items.push({
      id: normalizeUrl(p.url),
      type: "article",
      title: p.title.replace(/^\[[RDPN]\]\s*/i, ""),
      url: p.url,
      authorsOrSource: safeHost(p.url).replace(/^www\./, ""),
      summary: "",
      firstSeenDate: new Date(p.created_utc * 1000).toISOString(),
      signals: [
        { source: "reddit", metric: "score", value: p.score },
        { source: "reddit", metric: "comments", value: p.num_comments },
      ],
      tags: extractTags(p.title),
    });
  }
  return { source: "reddit-links", items };
};

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
