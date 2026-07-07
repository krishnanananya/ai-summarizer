import type { Adapter, RawItem } from "../../types";
import { fetchJson, truncate } from "../../http";
import { arxivAbsUrl, extractTags } from "../../normalize";
import { CONFIG } from "../../config";

interface HfPaperEntry {
  paper: {
    id: string; // arXiv ID
    title: string;
    summary: string;
    upvotes: number;
    publishedAt: string;
    authors?: { name: string }[];
  };
  publishedAt: string;
  numComments?: number;
}

// Hugging Face Daily Papers — primary papers signal (per-paper upvotes).
export const hfDaily: Adapter = async () => {
  const windowDays = CONFIG.paper.windowDays;
  const items: RawItem[] = [];
  // The API pages by date; pull enough pages to cover the window.
  const pages = Math.ceil(windowDays / 7);
  for (let p = 0; p < pages; p++) {
    const entries = await fetchJson<HfPaperEntry[]>(
      `https://huggingface.co/api/daily_papers?limit=50&p=${p}`
    );
    if (!Array.isArray(entries) || entries.length === 0) break;
    for (const e of entries) {
      if (!e?.paper?.id) continue;
      const text = `${e.paper.title} ${e.paper.summary ?? ""}`;
      items.push({
        id: e.paper.id,
        type: "paper",
        title: e.paper.title,
        url: arxivAbsUrl(e.paper.id),
        authorsOrSource:
          e.paper.authors?.map((a) => a.name).filter(Boolean).join(", ") ?? "",
        summary: truncate(e.paper.summary ?? "", 500),
        firstSeenDate: e.paper.publishedAt ?? e.publishedAt,
        signals: [
          { source: "hf", metric: "upvotes", value: e.paper.upvotes ?? 0 },
          ...(e.numComments
            ? [{ source: "hf", metric: "comments", value: e.numComments }]
            : []),
        ],
        tags: extractTags(text),
      });
    }
  }
  return { source: "hf-daily-papers", items };
};
