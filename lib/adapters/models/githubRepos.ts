import type { Adapter, RawItem } from "../../types";
import { fetchJson, truncate } from "../../http";
import { isAiRelevant, extractTags } from "../../normalize";
import { CONFIG } from "../../config";

interface GhRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  created_at: string;
  owner: { login: string };
  topics?: string[];
  language: string | null;
}

// New AI repos via GitHub search (unauthenticated: 10 req/min — one daily
// call is nowhere near the limit). Catches frameworks, inference engines,
// and method implementations. GITHUB_TOKEN env var is optional headroom.
// Star-farmed listicles, prompt dumps, and "free desktop app" scam repos
// trend hard around every big model launch — none of them are models.
const JUNK =
  /awesome-|prompt.?(vault|collection|library|list)|desktop.?app|free.?(access|download|version)|cheat.?sheet|roadmap|interview|tutorial|course|\bcracked\b|jailbreak/i;

export const githubRepos: Adapter = async () => {
  const since = new Date(
    Date.now() - CONFIG.model.windowDays * 86400_000
  )
    .toISOString()
    .slice(0, 10);
  // GitHub search allows max 5 boolean operators per query.
  const q = encodeURIComponent(
    `llm OR agent OR diffusion OR multimodal OR transformer created:>${since} stars:>25`
  );
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const data = await fetchJson<{ items: GhRepo[] }>(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=50`,
    { headers }
  );

  const items: RawItem[] = [];
  for (const r of data.items ?? []) {
    const text = `${r.full_name} ${r.description ?? ""} ${(r.topics ?? []).join(" ")}`;
    if (!isAiRelevant(text)) continue;
    if (JUNK.test(r.full_name) || JUNK.test(r.description ?? "")) continue;
    items.push({
      id: `gh:${r.full_name.toLowerCase()}`,
      type: "model",
      title: r.full_name,
      url: r.html_url,
      authorsOrSource: `${r.owner.login}${r.language ? ` · ${r.language}` : ""}`,
      summary: truncate(r.description ?? "", 300),
      firstSeenDate: r.created_at,
      signals: [
        { source: "github", metric: "stars", value: r.stargazers_count ?? 0 },
      ],
      tags: extractTags(text),
    });
  }
  return { source: "github-repos", items };
};
