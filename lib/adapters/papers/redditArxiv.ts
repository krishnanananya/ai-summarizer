import type { Adapter, RawItem } from "../../types";
import { fetchRedditPosts } from "../shared/reddit";
import { arxivIdFromUrl, arxivAbsUrl, extractTags } from "../../normalize";
import { truncate } from "../../http";

// Reddit link posts pointing at arXiv → an additional traction signal on papers.
export const redditArxiv: Adapter = async () => {
  const posts = await fetchRedditPosts(["MachineLearning", "LocalLLaMA"]);
  const items: RawItem[] = [];
  for (const p of posts) {
    const arxivId = p.url ? arxivIdFromUrl(p.url) : null;
    if (!arxivId) continue;
    items.push({
      id: arxivId,
      type: "paper",
      title: p.title.replace(/^\[[RDPN]\]\s*/i, ""),
      url: arxivAbsUrl(arxivId),
      authorsOrSource: `r/${p.subreddit}`,
      summary: truncate(p.selftext ?? "", 500),
      firstSeenDate: new Date(p.created_utc * 1000).toISOString(),
      signals: [
        { source: "reddit", metric: "score", value: p.score },
        { source: "reddit", metric: "comments", value: p.num_comments },
      ],
      tags: extractTags(p.title),
    });
  }
  return { source: "reddit-arxiv-links", items };
};
