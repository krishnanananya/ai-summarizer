import { fetchText, truncate } from "../../http";
import type { RawItem } from "../../types";

// arXiv official API — canonical metadata enrichment, not a traction source.
// Called after merge to fill missing titles/authors/abstracts/dates by ID.
export async function enrichFromArxiv(items: RawItem[]): Promise<void> {
  const needy = items.filter(
    (it) => !it.summary || !it.authorsOrSource || !it.title
  );
  if (needy.length === 0) return;

  const ids = needy.slice(0, 100).map((it) => it.id);
  const xml = await fetchText(
    `https://export.arxiv.org/api/query?id_list=${ids.join(",")}&max_results=${ids.length}`,
    {},
    10000
  );

  // Minimal XML parse — Atom entries are flat enough for regex extraction.
  const entries = xml.split("<entry>").slice(1);
  const byId = new Map<string, { title: string; summary: string; authors: string; published: string }>();
  for (const entry of entries) {
    const grab = (tag: string) =>
      entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
    const idUrl = grab("id");
    const id = idUrl.match(/abs\/(\d{4}\.\d{4,5})/)?.[1];
    if (!id) continue;
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .map((m) => m[1].trim())
      .join(", ");
    byId.set(id, {
      title: decodeEntities(grab("title")),
      summary: decodeEntities(grab("summary")),
      authors,
      published: grab("published"),
    });
  }

  for (const it of needy) {
    const meta = byId.get(it.id);
    if (!meta) continue;
    if (!it.title) it.title = truncate(meta.title, 300);
    if (!it.summary) it.summary = truncate(meta.summary, 500);
    if (!it.authorsOrSource || it.authorsOrSource.startsWith("r/"))
      it.authorsOrSource = meta.authors || it.authorsOrSource;
    if (meta.published) it.firstSeenDate = meta.published;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
