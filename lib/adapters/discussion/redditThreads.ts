import type { Adapter, RawItem } from "../../types";
import { fetchRedditPosts } from "../shared/reddit";
import { extractTags } from "../../normalize";
import { truncate } from "../../http";

// Reddit threads themselves as first-class items — the conversations, not links out.
export const redditThreads: Adapter = async () => {
  const posts = await fetchRedditPosts([
    "MachineLearning",
    "LocalLLaMA",
    "artificial",
  ]);
  const items: RawItem[] = [];
  for (const p of posts) {
    if (!p.is_self) continue; // discussion = self posts; link posts feed other tabs
    const permalink = `https://www.reddit.com${p.permalink}`;
    items.push({
      id: p.permalink,
      type: "discussion",
      title: p.title,
      url: permalink,
      authorsOrSource: `r/${p.subreddit}`,
      summary: truncate(p.selftext ?? "", 500),
      firstSeenDate: new Date(p.created_utc * 1000).toISOString(),
      signals: [
        { source: "reddit", metric: "score", value: p.score },
        { source: "reddit", metric: "comments", value: p.num_comments },
      ],
      tags: extractTags(`${p.title} ${p.selftext ?? ""}`),
    });
  }
  return { source: "reddit-threads", items };
};
