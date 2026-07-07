import type {
  Adapter,
  AdapterResult,
  CachedBlob,
  ItemType,
  RawItem,
  TabResult,
} from "./types";
import { CONFIG } from "./config";
import { scoreItems } from "./score";
import { hfDaily } from "./adapters/papers/hfDaily";
import { redditArxiv } from "./adapters/papers/redditArxiv";
import { enrichFromArxiv } from "./adapters/papers/arxiv";
import { hn } from "./adapters/articles/hn";
import { redditLinks } from "./adapters/articles/redditLinks";
import { vendorRss } from "./adapters/articles/vendorRss";
import { hfModels } from "./adapters/models/hfModels";
import { githubRepos } from "./adapters/models/githubRepos";
import { redditThreads } from "./adapters/discussion/redditThreads";
import { arenaLeaderboard } from "./adapters/llms/arena";

const ADAPTERS: Record<ItemType, Adapter[]> = {
  paper: [hfDaily, redditArxiv],
  model: [hfModels, githubRepos],
  llm: [arenaLeaderboard],
  article: [hn, redditLinks, vendorRss],
  discussion: [redditThreads],
};

// Merge partial items sharing a dedup key: union signals, keep the richest
// metadata and the earliest firstSeenDate. Corroboration falls out of this.
function mergeItems(results: RawItem[][]): RawItem[] {
  const byId = new Map<string, RawItem>();
  for (const items of results) {
    for (const it of items) {
      const prev = byId.get(it.id);
      if (!prev) {
        byId.set(it.id, { ...it, signals: [...it.signals], tags: [...it.tags] });
        continue;
      }
      prev.signals.push(...it.signals);
      prev.tags = [...new Set([...prev.tags, ...it.tags])];
      if (it.summary.length > prev.summary.length) prev.summary = it.summary;
      if (it.authorsOrSource && !prev.authorsOrSource)
        prev.authorsOrSource = it.authorsOrSource;
      if (new Date(it.firstSeenDate) < new Date(prev.firstSeenDate))
        prev.firstSeenDate = it.firstSeenDate;
    }
  }
  return [...byId.values()];
}

async function runTab(type: ItemType): Promise<TabResult> {
  const settled = await Promise.allSettled(ADAPTERS[type].map((a) => a()));
  const sources: TabResult["sources"] = [];
  const collected: RawItem[][] = [];

  settled.forEach((r, i) => {
    const name = ADAPTERS[type][i].name || `adapter-${i}`;
    if (r.status === "fulfilled") {
      const res: AdapterResult = r.value;
      sources.push({ source: res.source, ok: true, count: res.items.length });
      collected.push(res.items);
    } else {
      sources.push({
        source: name,
        ok: false,
        count: 0,
        error: String(r.reason?.message ?? r.reason),
      });
    }
  });

  const merged = mergeItems(collected);

  if (type === "paper") {
    try {
      await enrichFromArxiv(merged);
    } catch (e) {
      sources.push({
        source: "arxiv-enrichment",
        ok: false,
        count: 0,
        error: String((e as Error).message),
      });
    }
  }

  return { items: scoreItems(type, merged), sources };
}

export async function runPipeline(): Promise<CachedBlob> {
  const blob: CachedBlob = { generatedAt: new Date().toISOString(), tabs: {} };
  for (const type of Object.keys(CONFIG) as ItemType[]) {
    if (!CONFIG[type].enabled) continue;
    blob.tabs[type] = await runTab(type);
  }
  // Spec: log which sources succeeded each run.
  for (const [type, tab] of Object.entries(blob.tabs)) {
    for (const s of tab!.sources) {
      console.log(
        `[refresh] ${type}/${s.source}: ${s.ok ? `ok (${s.count} items)` : `FAILED — ${s.error}`}`
      );
    }
  }
  return blob;
}
