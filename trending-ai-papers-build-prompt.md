# Claude Code Build Prompt — Trending AI Media Radar (Option B)

> **Status:** Full Option B — item-centric, 3 tabs (Papers / Articles / Discussion), traction-ranked per tab, $0 free-tier compatible. Twitter/X ruled out (no free read API tier).
> **Build order (single pass):** papers pipeline first (proves the Item model) → Articles (HN + Reddit links) → Discussion. Each tab has a one-line kill switch.
> **If energy flags mid-build:** the natural stop is after Articles, with the Discussion tab's flag off — it's the least-validated channel.

---

```
Build a personal "trending AI media" radar web app. It's for my own use on my phone only — no multi-user auth, no public launch, no analytics.

## What it does
Surfaces AI/ML content that currently has the HIGHEST TRACTION, across three media types shown in separate tabs, each independently ranked within its own recent-time window:
- Papers — trending research (~21-day window).
- Articles — trending blog posts / news (~3–7 day window).
- Discussion — trending community threads (~2–5 day window).
Different media types trend on different clocks, so they are NEVER ranked against each other in one list — each tab is ranked internally against its own kind.

## Core data model (build around this from line one)
Everything is a generic Item, NOT a Paper. This is the key decision that keeps the three tabs additive rather than a refactor.

  Item {
    id            // stable per-type key (see dedup below)
    type          // 'paper' | 'article' | 'discussion'
    title
    url           // canonical link (arxiv abstract, article URL, or reddit permalink)
    authorsOrSource
    summary       // abstract snippet, article excerpt, or thread selftext snippet
    firstSeenDate
    signals[]     // { source, metric, value } — e.g. {hn, points, 240}, {reddit, comments, 88}, {hf, upvotes, 142}
    tractionScore // computed, per-type normalized
    tags[]
  }

Adapters produce Items. Tabs render Items filtered by type. Adding a media type later = new adapter + new tab, no core-model surgery.

## Tech stack (use unless you hit a real blocker)
- Next.js (App Router) + Tailwind, deployed to Vercel (free Hobby tier — keep everything within Hobby limits).
- Installable PWA (manifest + service worker) so I can add it to my iPhone home screen and open it fullscreen.
- A Vercel Cron job refreshes all sources and caches results so opening the app is instant.
- No login. Any secret/API key comes from env vars; provide a .env.example.
- A single top-level config object with per-tab settings: { enabled, windowDays, weights }. Each tab must be disable-able by flipping enabled=false in one line.

## Sources, per media type (dedupe as noted; every source wrapped in try/catch, fast timeout, graceful degradation — one dead source drops its signal, never crashes the pipeline; log which sources succeeded each run)

PAPERS (type: 'paper', window ~21d, dedup by arXiv ID)
- Hugging Face Daily Papers (per-paper upvote counts — primary signal).
- alphaXiv trending papers.
- arXiv official API (canonical metadata: title, authors, abstract, categories, submission date).
- Reddit r/MachineLearning + r/LocalLLaMA link posts that point at arXiv (upvotes + comments as an additional signal on the paper).
- Papers with Code — ATTEMPT but assume it may be dead (Meta is sunsetting it); on failure, log and skip.

ARTICLES (type: 'article', window ~3–7d, dedup by NORMALIZED URL — strip tracking params, canonicalize http/https + trailing slash)
- Hacker News via the Algolia API (free, no auth) — filter to AI/ML-relevant stories; points + comments are the traction signal.
- Reddit r/MachineLearning + r/LocalLLaMA + r/artificial link posts pointing at NON-arXiv URLs (blogs, news, company posts) — score + comments as signal.

DISCUSSION (type: 'discussion', window ~2–5d, dedup by Reddit permalink) — [BUILD BEHIND enabled FLAG; least-validated tab]
- Reddit threads themselves (r/MachineLearning, r/LocalLLaMA, r/artificial) as first-class items — score + comment count as traction. These are the conversations, not links out.

## Ranking (per tab, no cross-tab comparison, traction only — no momentum, no history)
- Hard filter per tab: only items whose firstSeenDate is within that tab's windowDays. Windows are configurable per tab.
- tractionScore = engagement magnitude normalized 0–1 WITHIN that type (so a paper's HF upvotes are normalized against other papers, an article's HN points against other articles), summed across that item's signals, PLUS a corroboration bonus when an item appears on multiple sources (mainly relevant for papers).
- Tiebreaker only: when scores are close, newer ranks higher. Newness is a tiebreaker, NOT a primary factor.
- Weights live in the per-tab config object so I can tune each tab independently.
- No persistence of signal history. Each cron run computes scores fresh from a single snapshot.

## Refresh / caching (must stay within Vercel free tier)
Vercel Cron runs ONCE PER DAY (required by the free Hobby tier — more frequent cron expressions fail deployment). Daily is fine for all three windows. Use schedule "0 8 * * *". On each run: fetch all enabled sources, compute per-tab scores, and OVERWRITE a single cached results blob (Vercel KV free tier is plenty). The app reads that blob, so loads are instant. If a refresh partially fails, keep the last good cache rather than serving empty. Secure the cron route with the CRON_SECRET Authorization-header check.
NOTE: the ~2–5 day Discussion window is the tightest fit against once-daily refresh; if it ever feels stale that is the free-tier cron limit, not a bug.

## UI (mobile-first, one-handed)
- Three tabs: Papers / Articles / Discussion. Discussion tab hidden when its config flag is off.
- Each tab: ranked list of cards showing title, source/authors (truncated), 2–3 sentence summary, tractionScore + a short WHY breakdown (e.g. "240 HN points · 88 comments" or "142 HF upvotes · on 3 sources"), tags, date, and direct link(s). Tap to expand full summary.
- Per-tab window filter and a text search.

## Build process (STRICT ORDER — one continuous build, not staged across sessions)
1. Scaffold the Item model, the config object, the tabbed PWA shell, the daily cron, and KV caching. Wire the PAPERS adapter end-to-end into the Papers tab. Confirm the full pipeline (fetch → score → cache → render → installable on phone) works before anything else.
2. Add the ARTICLES adapters (Hacker News + Reddit non-arXiv links) into the Articles tab. Confirm.
3. Add the DISCUSSION adapter (Reddit threads-as-items) into the Discussion tab, with its config flag defaulting ON but trivially flippable to OFF.
- Before any opinionated architectural choice, state your reasoning in one line and proceed with the sensible default — don't stop to ask unless genuinely blocking.
- README with: local run, deploy to Vercel, set the daily cron, enable Vercel KV, add to iPhone home screen, and how to disable a tab via config.

Start by laying out the file structure, the Item model, and the adapter interface, then build in the order above.
```

---

## Notes / potential later refinements (not in the prompt)

- **Validation checkpoint after step 2:** once the Articles tab has real data, judge whether HN + Reddit actually surface AI content the Papers tab misses. If yes, B was worth it. If the Articles tab is mostly reposts of the same papers, that's your signal to keep this a paper-centric radar and leave Discussion off.
- **Twitter/X:** excluded — no free read API tier. Revisit only if you're willing to pay for API access.
- **Momentum ("blew up overnight"):** still deliberately out. Requires a stored history layer the current stateless snapshot design omits. Add only if daily standings prove insufficient.
