import type { Adapter, RawItem } from "../../types";
import { fetchJson } from "../../http";

interface HfModel {
  id: string; // "org/name"
  author?: string;
  likes: number;
  downloads: number;
  trendingScore?: number;
  createdAt: string;
  tags?: string[];
  pipeline_tag?: string;
  library_name?: string;
}

// Hugging Face Hub trending models — the canonical "new open model" signal.
// The trending list includes older models; the tab's window filter keeps only
// recently created ones, so pull a deep page.
export const hfModels: Adapter = async () => {
  const models = await fetchJson<HfModel[]>(
    "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=300"
  );
  const items: RawItem[] = [];
  for (const m of models ?? []) {
    if (!m?.id || !m.createdAt) continue;
    const name = m.id.split("/").pop() ?? m.id;
    // Structured chips instead of tag-soup prose: task, size, license, format.
    const size = name.match(/(\d+(?:\.\d+)?)[bB](?![a-z])/)?.[0]?.toUpperCase();
    const license = (m.tags ?? [])
      .find((t) => t.startsWith("license:"))
      ?.slice("license:".length);
    const tags = [
      m.pipeline_tag,
      size,
      m.library_name === "gguf" || name.toUpperCase().includes("GGUF")
        ? "gguf"
        : undefined,
      license,
    ].filter((t): t is string => Boolean(t));
    items.push({
      id: `hf:${m.id}`,
      type: "model",
      title: name,
      url: `https://huggingface.co/${m.id}`,
      authorsOrSource: m.author ?? m.id.split("/")[0],
      summary: "",
      firstSeenDate: m.createdAt,
      signals: [
        { source: "hf", metric: "likes", value: m.likes ?? 0 },
        { source: "hf", metric: "downloads", value: m.downloads ?? 0 },
      ],
      tags: tags.slice(0, 4),
    });
  }
  return { source: "hf-models", items };
};
