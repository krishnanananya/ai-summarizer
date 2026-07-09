# AI Radar — App Status

_Last updated: 2026-07-07_

A personal PWA ("AI Media Radar") that surfaces the highest-traction AI/ML content in independently ranked tabs, with a Gemini-powered chatbot mascot. Built for one phone, no auth, no analytics, free-tier everything (Vercel Hobby + Upstash Redis + Gemini free tier).

## Current feature set

### Tabs (bottom nav, swipe or tap to switch)

| Tab | Window | Sources | Notes |
|---|---|---|---|
| Today | — | cross-tab digest | Three speeds: Gemini **Daily brief** bullets → "Since your last visit" tiles → "Still trending" tiles; **Saved for later** list at the bottom |
| Papers | 21d | HF Daily Papers, arXiv enrichment, Reddit | 7d decay half-life so one megapaper can't pin #1 all window |
| LLMs | standing | LMArena leaderboard | Per-benchmark sortable table with week-over-week deltas |
| Articles | 8d | HN, Reddit links, vendor RSS | RSS is a presence guarantee, ranks by aggregator traction; title-only entries get a Gemini one-line summary at refresh |
| Discussion | 7d | Reddit threads | Reddit-only; **auto-hidden from nav while empty** (until Reddit creds are set) |
| ~~Models~~ | 14d | HF trending, GitHub repos | **Hidden from nav** (`hiddenInUi: true` in `lib/config.ts`) but adapters still run — data feeds Today's "Releases" tiles and the chatbot |

Empty tabs are hidden from the nav automatically (`/api/items` reports them `enabled: false`) and reappear once a refresh fills them. The dead alphaXiv / Papers-with-Code adapters were removed entirely (2026-07-07).

Per-tab: search, time-window filter, sort modes (Top / New / Discussed / Weeks), source chips, frontier-lab shortcut chips (OpenAI, Anthropic, Google, …), new-since-last-visit badges and dividers, bookmark-to-save on every card and tile.

### Daily catch-up loop (added 2026-07-07, story digest 2026-07-09)

- **Story digest** (replaced the bullet brief on 2026-07-09): refresh sends Gemini traction-ranked candidates per tab **plus all ≤3-day-old frontier-lab watchlist hits** (force-included regardless of traction — brand-new releases have no points yet) with an editorial rubric: frontier-lab releases first, then policy/safety, then papers/benchmarks, then high-traction misc. Returns 4–6 ranked stories as JSON (`{headline, why, ids[]}`, `blob.digest`), grouping a launch article + weights + thread into one story. Fail-soft; ids are validated against the cache.
- **Watchlist** lives in `lib/editorial.ts`: lab regexes (shared with the UI filter chips — includes model codenames like Sol/Terra/Luna) + release-language regex; any lab-matching model item counts. **Tune importance here** (regexes) and in the rubric text in `lib/brief.ts`.
- **Today layout** (2026-07-09): inverted pyramid — lead story (17px headline + why + source-chip links + 3-step relative-traction meter ▮▮▮), numbered stories 2–6, "Also on the radar" one-liners, Saved for later. "New since last visit" is a violet ● badge on stories (rank stays editorial); fully-read stories dim. No digest in the blob → falls back to the previous Since-your-last-visit / Still-trending tile grid.
- **Summary backfill**: second Gemini call writes one-sentence summaries into the top ~40 articles that arrived title-only (HN). Both calls run in parallel with 15s timeouts and `thinkingBudget: 0`.
- **✓ Caught up** button (header, shown when anything is new) advances the visit boundary to now — clears all badges without waiting out the 30-min session gap.
- **Manual refresh button** (header, added 2026-07-09): POST `/api/refresh` needs no secret — debounced server-side (no-op under 30-min blob age, returns `fresh`) plus a Redis NX / module-state lock against concurrent runs; the cron GET keeps its `CRON_SECRET`. Spinner runs for the ~20–40s pipeline, then the client re-pulls `/api/items`.
- **Saved for later**: bookmark toggle on cards and tiles stores snapshots (`{id,type,title,url,savedAt}`, cap 100) in localStorage so links outlive feed windows; listed with remove buttons at the bottom of Today.

### Snap le Chat (chatbot)

- **UI**: floating cat-icon button (bottom-right) opens a bottom sheet at ~55% screen height, expandable to full screen; backdrop tap or × closes; conversation persists across open/close. Mascot is an inline-SVG line-drawn cat ("chat" = French for cat) with CSS-animated tail swish and blinking eyes.
- **Backend**: `POST /api/chat` (streaming). Server-side `GEMINI_API_KEY` only — never shipped to clients. Model `gemini-2.5-flash` (override via `GEMINI_MODEL`).
- **Grounding**: system prompt is seeded with the top cached items from every tab (including hidden Models), plus **Google Search grounding** so substantive questions get researched answers with a "Sources:" line appended.
- **Scope guardrail**: prompt restricts Snap to AI/ML topics; off-topic requests get a one-line playful deflection with no web search (protects the free grounding quota). Prompt-level only — not jailbreak-proof; hard backstops are the rate limit and Gemini's own daily caps.
- **Rate limiting**: 20 messages/IP/hour via Upstash (production only; no limit in local dev).

### Swipe navigation + galaxy motion

- Drag horizontally anywhere in the content to move between tabs: pane follows the finger, commits on >30% width or a velocity flick, springs back otherwise; rubber-band resistance at the first/last tab. Implemented in `components/useSwipeNav.ts`.
- The canvas starfield (`GalaxyBackground`) pans with the gesture, depth-scaled per star (deep stars sweep, near stars barely move), on top of its existing scroll parallax, accent crossfade, radar pings, and shooting stars.
- Vertical scrolling stays native; drags inside the LLM table's horizontal scroller are ignored; `prefers-reduced-motion` gets instant switches.
- Known limitation: slide-and-replace pager — the adjacent tab's content does not "peek" during the drag (would require rendering neighbor tabs simultaneously).

## Architecture

- **Next.js 15 / React 19 / Tailwind 4**, deployed on Vercel Hobby.
- Everything is a generic `Item` (`lib/types.ts`); one adapter per source (`lib/adapters/`); pipeline merges by dedup key and unions traction signals; `lib/score.ts` normalizes and weight-sums per `lib/config.ts`.
- Daily Vercel cron (`0 8 * * *`, Hobby max) hits `/api/refresh` (guarded by `CRON_SECRET`), which overwrites one cached blob — Upstash Redis in prod, `.cache/results.json` locally. The app reads only that blob. All-sources-failed runs keep the last good cache.
- `/api/items` serves the blob + tab config (hidden tabs report `enabled: false` to the client).
- iPhone install: Safari → Share → Add to Home Screen (standalone PWA).

## Environment variables

| Var | Status | Purpose |
|---|---|---|
| `CRON_SECRET` | set | Auth for `/api/refresh` |
| `UPSTASH_REDIS_REST_URL/TOKEN` | prod only | Cache + chat rate limit (local falls back to file / no limit) |
| `GEMINI_API_KEY` | **user has key; set in `.env.local`, must also be set in Vercel** | Chat |
| `GEMINI_MODEL` | optional | Model override |
| `REDDIT_CLIENT_ID/SECRET` | **not yet configured** | Fixes Reddit 403s (datacenter IPs); Discussion tab is empty without it |
| `GITHUB_TOKEN` | optional | Rate-limit headroom for model repos |

## Known issues / quirks

- **Reddit 403s** many datacenter/ISP IPs on the public JSON API — the free script-app OAuth creds (reddit.com/prefs/apps) fix it; not set up yet. Discussion tab stays auto-hidden until then.
- Once-daily refresh is a Hobby-tier cron limit; short-window tabs (Discussion) run stale by design. (Multi-refresh via GitHub Actions was proposed and explicitly deferred.)
- Article summary backfill writes from title + model knowledge (no web search, to protect quota) — cryptic HN titles get a plain restatement, not real reporting.
- Chat quality depends on the Gemini free tier: ~250–1,000 requests/day model quota plus a grounded-search daily allowance; when grounding quota runs out, answers silently degrade to ungrounded.
- "Snap le Chat" naming: fine for personal use; reconsider (with the built-in pun alternatives) before any App Store release.

## Verified working (local)

- Production build + typecheck clean (re-verified 2026-07-07 after the catch-up-loop changes).
- `/api/refresh` populates all enabled tabs (HF, HN, GitHub, arena OK; Reddit fails without creds); with the real Gemini key it produced a 6-bullet brief and filled 40 article summaries; `/api/items` reported Discussion `enabled: false` while empty.
- `/api/chat` error paths (missing key, bad body, rate-limit) return clean JSON; streaming path exercised by the user with a real key — grounded answers confirmed working after the search-grounding upgrade.
- Chat sheet, cat animations, hidden-Models behavior, and swipe wrapper all confirmed rendering; swipe gesture physics awaiting on-device feel test.

## Ideas discussed, not yet built

1. **"Ask about this" on item cards** — open Snap pre-seeded with that paper/article (biggest bang-for-buck next step).
2. **Peek-style swipe carousel** — render adjacent tabs during the drag.
3. Thinking/typing cat poses (ears perk while Snap is responding).
4. New-items dot on the chat button tied to the Today badge.
5. If chat goes public: pre-classification or Firebase App Check on top of the prompt guardrail.
6. Native iOS app — same `/api/chat` + `/api/items` backend would serve it; PWA covers current needs.
7. **Multi-refresh per day** (GitHub Actions cron hitting `/api/refresh`, or stale-while-revalidate on app open) — proposed 2026-07-07, deliberately deferred by the user.
