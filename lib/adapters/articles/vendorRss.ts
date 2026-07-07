import type { Adapter, RawItem } from "../../types";
import { fetchText, truncate } from "../../http";
import { normalizeUrl, extractTags } from "../../normalize";
import { CONFIG } from "../../config";

// Official vendor blogs via RSS — a presence guarantee, not a traction source.
// Items merge by normalized URL with HN/Reddit coverage of the same post, so
// announcements that blow up rank by that traction; quiet ones still appear
// via the small rss:official baseline weight.
// Anthropic and Meta AI publish no RSS feed; their news arrives via HN/Reddit.
const FEEDS: { name: string; url: string }[] = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Mistral", url: "https://mistral.ai/rss.xml" },
];

export const vendorRss: Adapter = async () => {
  const cutoff = Date.now() - CONFIG.article.windowDays * 86400_000;
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => ({ feed: f, xml: await fetchText(f.url) }))
  );

  const items: RawItem[] = [];
  let anyOk = false;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    anyOk = true;
    const { feed, xml } = r.value;
    for (const entry of parseRss(xml)) {
      if (!entry.link || !entry.title) continue;
      const ts = entry.date ? Date.parse(entry.date) : NaN;
      if (Number.isNaN(ts) || ts < cutoff) continue;
      items.push({
        id: normalizeUrl(entry.link),
        type: "article",
        title: entry.title,
        url: entry.link,
        authorsOrSource: feed.name,
        summary: truncate(stripHtml(entry.description), 400),
        firstSeenDate: new Date(ts).toISOString(),
        signals: [{ source: "rss", metric: "official", value: 1 }],
        tags: extractTags(`${entry.title} ${entry.description}`),
      });
    }
  }
  if (!anyOk) throw new Error("all RSS feeds failed");
  return { source: "vendor-rss", items };
};

interface RssEntry {
  title: string;
  link: string;
  date: string;
  description: string;
}

// Minimal RSS 2.0 / Atom parse — same regex approach as the arXiv adapter.
function parseRss(xml: string): RssEntry[] {
  const blocks = xml.includes("<item>")
    ? xml.split(/<item[\s>]/).slice(1)
    : xml.split(/<entry[\s>]/).slice(1);
  return blocks.map((b) => {
    const grab = (tag: string) =>
      b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
    // Atom links live in an attribute; RSS links are element text.
    const atomLink = b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
    return {
      title: decode(stripCdata(grab("title"))),
      link: stripCdata(grab("link")).trim() || atomLink,
      date:
        grab("pubDate") || grab("published") || grab("updated") ||
        grab("dc:date"),
      description: decode(
        stripCdata(grab("description") || grab("summary") || grab("content"))
      ),
    };
  });
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
