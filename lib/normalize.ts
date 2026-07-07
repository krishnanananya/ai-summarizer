// arXiv ID extraction: matches abs/pdf/html links, with or without version suffix.
const ARXIV_RE = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i;

export function arxivIdFromUrl(url: string): string | null {
  const m = url.match(ARXIV_RE);
  return m ? m[1] : null;
}

export function arxivAbsUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "ref_src", "fbclid", "gclid", "mc_cid", "mc_eid", "s", "si",
]);

// Article dedup key: https, no tracking params, no trailing slash, lowercase host.
export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.protocol = "https:";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) u.searchParams.delete(p);
    }
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return rawUrl;
  }
}

const AI_KEYWORDS = [
  "ai", "artificial intelligence", "machine learning", "ml", "llm", "llms",
  "gpt", "claude", "gemini", "openai", "anthropic", "deepmind", "hugging face",
  "neural", "transformer", "diffusion", "language model", "deep learning",
  "rag", "agents", "agentic", "fine-tun", "reinforcement learning", "rlhf",
  "mistral", "llama", "qwen", "deepseek", "inference", "multimodal",
  "embedding", "chatbot", "copilot", "stable diffusion", "generative",
];

// Word-boundary match for short tokens, substring for phrases.
export function isAiRelevant(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return AI_KEYWORDS.some((kw) =>
    kw.length <= 3
      ? new RegExp(`[^a-z0-9]${kw}[^a-z0-9]`).test(lower)
      : lower.includes(kw)
  );
}

export function extractTags(text: string, max = 4): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const TAGGABLE = [
    "llm", "agents", "rag", "diffusion", "multimodal", "reinforcement learning",
    "reasoning", "benchmark", "open source", "vision", "audio", "robotics",
    "safety", "evals", "fine-tuning", "inference", "training",
  ];
  for (const t of TAGGABLE) {
    if (found.length >= max) break;
    if (lower.includes(t)) found.push(t);
  }
  return found;
}
