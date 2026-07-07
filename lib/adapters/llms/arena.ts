import type { Adapter, RawItem } from "../../types";
import { fetchText } from "../../http";

// LMArena (arena.ai) per-benchmark leaderboards. No public API; each board
// page embeds its rows as escaped JSON in the RSC flight payload — same
// regex-extraction approach as the arXiv/RSS adapters. Every page carries
// several boards back to back; the page's own board comes first, so rows are
// taken until the rank counter restarts at 1.
//
// Each row becomes one item tagged with its board key; the LlmBoard UI
// groups by that tag and ranks by signal value. The agent board uses a
// different schema (0–1 win score instead of Elo) — stored as score × 100.
export const ARENA_BOARDS = [
  { key: "text", label: "Text" },
  { key: "code", label: "Code" },
  { key: "vision", label: "Vision" },
  { key: "agent", label: "Agent" },
  { key: "search", label: "Search" },
] as const;

const MAX_ROWS_PER_BOARD = 100;

interface EloRow {
  rank: number;
  modelKey: string;
  modelDisplayName: string;
  rating: number;
  votes: number | null;
  modelOrganization: string;
  modelUrl: string | null;
  license: string | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  contextLength: number | null;
}

interface AgentRow {
  rank: number;
  contenderName: string;
  model: string;
  modelOrganization: string;
  license: string | null;
  score: number; // 0–1
}

export const arenaLeaderboard: Adapter = async () => {
  const settled = await Promise.allSettled(
    ARENA_BOARDS.map(async (b) => ({
      board: b,
      html: await fetchText(`https://arena.ai/leaderboard/${b.key}`, {}, 20000),
    }))
  );

  const items: RawItem[] = [];
  const now = new Date().toISOString();
  const failures: string[] = [];

  for (const r of settled) {
    if (r.status !== "fulfilled") {
      failures.push(String(r.reason?.message ?? r.reason));
      continue;
    }
    const { board, html } = r.value;
    const rows =
      board.key === "agent"
        ? parseAgentBoard(html)
        : parseEloBoard(html, board.key);
    for (const row of rows.slice(0, MAX_ROWS_PER_BOARD)) {
      items.push({ ...row, type: "llm", firstSeenDate: now, tags: [board.key] });
    }
  }

  if (items.length < 10)
    throw new Error(
      `arena leaderboards parsed only ${items.length} rows (${failures.join("; ")})`
    );
  return { source: "arena-leaderboard", items };
};

type ParsedRow = Omit<RawItem, "type" | "firstSeenDate" | "tags">;

// Rows are ordered; stop at the second rank===1 (the next board's start).
function firstBoard<T extends { rank: number }>(rows: T[]): T[] {
  const out: T[] = [];
  let started = false;
  for (const row of rows) {
    if (row.rank === 1) {
      if (started) break;
      started = true;
    }
    if (started) out.push(row);
  }
  return out;
}

function extractJson<T>(html: string, pattern: RegExp): T[] {
  const out: T[] = [];
  for (const m of html.match(pattern) ?? []) {
    try {
      out.push(JSON.parse(m.replace(/\\"/g, '"')) as T);
    } catch {
      /* skip malformed fragment */
    }
  }
  return out;
}

function parseEloBoard(html: string, boardKey: string): ParsedRow[] {
  const rows = extractJson<EloRow>(
    html,
    /\{[^{}]*\\"rating\\":[0-9.][^{}]*\}/g
  ).filter((r) => typeof r.rank === "number" && r.modelDisplayName);
  return firstBoard(rows).map((r) => ({
    // modelKey alone is not unique across boards — namespace by board so the
    // pipeline's id-based merge never collapses rows from different boards.
    id: `arena:${boardKey}:${r.modelKey}`,
    title: r.modelDisplayName,
    url: r.modelUrl || "https://arena.ai/leaderboard",
    authorsOrSource: r.modelOrganization,
    summary: describeElo(r),
    signals: [{ source: "arena", metric: "elo", value: Math.round(r.rating) }],
  }));
}

function parseAgentBoard(html: string): ParsedRow[] {
  const rows = extractJson<AgentRow>(
    html,
    /\{[^{}]*\\"contenderName\\"[^{}]*\}/g
  ).filter((r) => typeof r.rank === "number" && r.model);
  return firstBoard(rows).map((r) => ({
    id: `arena:agent:${r.contenderName}`,
    title: r.model,
    url: "https://arena.ai/leaderboard/agent",
    authorsOrSource: r.modelOrganization,
    summary: r.license ?? "",
    signals: [
      { source: "arena", metric: "score", value: Math.round(r.score * 1000) / 10 },
    ],
  }));
}

function describeElo(r: EloRow): string {
  const parts: string[] = [];
  if (r.contextLength) parts.push(`${fmtCtx(r.contextLength)} context`);
  if (r.inputPricePerMillion != null && r.outputPricePerMillion != null)
    parts.push(`$${r.inputPricePerMillion}/M in · $${r.outputPricePerMillion}/M out`);
  if (r.votes) parts.push(`${fmtVotes(r.votes)} votes`);
  if (r.license) parts.push(r.license);
  return parts.join(" · ");
}

function fmtCtx(n: number): string {
  return n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`;
}

function fmtVotes(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}
