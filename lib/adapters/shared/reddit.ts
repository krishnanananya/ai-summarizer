import { fetchJson } from "../../http";

export interface RedditPost {
  subreddit: string;
  title: string;
  url?: string; // outbound link (equals permalink URL for self posts)
  permalink: string;
  selftext?: string;
  is_self: boolean;
  score: number;
  num_comments: number;
  created_utc: number;
  link_flair_text?: string | null;
}

interface RedditListing {
  data: { children: { data: RedditPost }[] };
}

// Reddit blocks some IP ranges on the public JSON endpoints. Strategy:
// 1. Try the free unauthenticated endpoint.
// 2. If REDDIT_CLIENT_ID/SECRET are set (free "script" app), fall back to
//    app-only OAuth against oauth.reddit.com.
// If both fail, the error surfaces to the pipeline's per-adapter try/catch.

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOauthToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );
  cachedToken = {
    token: res.access_token,
    expiresAt: Date.now() + (res.expires_in - 60) * 1000,
  };
  return res.access_token;
}

async function fetchListing(sub: string, t: string, limit: number): Promise<RedditListing> {
  try {
    return await fetchJson<RedditListing>(
      `https://www.reddit.com/r/${sub}/top.json?t=${t}&limit=${limit}&raw_json=1`
    );
  } catch (publicErr) {
    const token = await getOauthToken();
    if (!token) throw publicErr;
    return fetchJson<RedditListing>(
      `https://oauth.reddit.com/r/${sub}/top?t=${t}&limit=${limit}&raw_json=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }
}

export async function fetchRedditPosts(
  subreddits: string[],
  t: "week" | "day" = "week",
  limit = 50
): Promise<RedditPost[]> {
  const results = await Promise.allSettled(
    subreddits.map((sub) => fetchListing(sub, t, limit))
  );
  const posts: RedditPost[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") {
      errors.push(String(r.reason?.message ?? r.reason));
      continue;
    }
    for (const c of r.value.data.children) posts.push(c.data);
  }
  if (posts.length === 0)
    throw new Error(`all subreddit fetches failed: ${errors[0] ?? "unknown"}`);
  return posts;
}
