# AI Media Radar

Personal PWA that surfaces the highest-traction AI/ML content in four independently ranked tabs — **Papers** (~21d window), **Models** (~14d), **Articles** (~5d), **Discussion** (~4d). Each tab is ranked only against its own kind. Built for one phone, no auth, no analytics, free-tier everything.

Sources: Hugging Face Daily Papers + arXiv metadata (papers); HF Hub trending models + new GitHub AI repos (models); Hacker News, Reddit links, and official vendor blog RSS — OpenAI, DeepMind, Google AI, HF, Mistral (articles); Reddit threads (discussion). RSS is a presence guarantee rather than a traction signal: official announcements merge by URL with their HN/Reddit coverage and rank by that traction, but still appear (low-ranked) with zero pickup.

The Today tab is built as three reading speeds for a 5–10 minute daily check-in: a Gemini-written **Daily brief** (4–6 bullets, generated once per refresh), then tile sections — **Since your last visit** first, **Still trending** below — then the per-kind tabs as the deep dive. A **✓ Caught up** button in the header advances the last-visit boundary on demand, and a bookmark on every card/tile feeds a **Saved for later** list at the bottom of Today (stored as snapshots in localStorage, so saved links outlive the feed windows).

## How it works

- Everything is a generic `Item` (`lib/types.ts`). Adapters (`lib/adapters/`) fetch one source each and emit partial items; the pipeline (`lib/pipeline.ts`) merges them by dedup key (papers: arXiv ID, models: prefixed HF/GitHub id, articles: normalized URL, discussion: Reddit permalink), unioning traction signals.
- `lib/score.ts` normalizes each signal 0–1 within its tab, weighted-sums per `lib/config.ts`, adds a corroboration bonus for multi-source items. Newness is only a tiebreaker.
- A daily cron hits `/api/refresh`, which overwrites one cached blob (Upstash Redis in prod, `.cache/results.json` locally). The app reads only that blob, so loads are instant. If every source fails, the last good cache is kept.
- Every source is wrapped in try/catch with an 8s timeout; a dead source drops its signal and is logged, never crashing the run. The refresh response and server log list which sources succeeded.
- After the pipeline, the refresh makes two fail-soft Gemini calls (needs `GEMINI_API_KEY`, same key as chat): one writes the Daily brief bullets into the cached blob, one backfills one-line summaries for title-only articles (HN gives no summary text). No key, a timeout, or a quota error just skips the enrichment for that run.
- A tab whose last refresh produced zero items is hidden from the nav automatically (e.g. Discussion before Reddit creds are set) and reappears once a refresh fills it.

## Local run

```bash
npm install
CRON_SECRET=devsecret npm run dev
# in another terminal — populate the cache once:
curl -H "Authorization: Bearer devsecret" http://localhost:3000/api/refresh
# open http://localhost:3000
```

No env vars are required locally: without Upstash creds the cache falls back to `.cache/results.json`.

## Deploy to Vercel (Hobby tier)

1. Push this repo to GitHub and import it in Vercel (framework auto-detects Next.js).
2. **Cron** is already configured in `vercel.json` (`0 8 * * *` — once daily, the Hobby-tier maximum). Nothing to click; it activates on deploy.
3. **KV storage**: in the Vercel dashboard → Storage → Marketplace → add **Upstash Redis** (free tier) and connect it to the project. It injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` automatically.
4. **Secure the cron**: Project → Settings → Environment Variables → add `CRON_SECRET` (any random string). Vercel Cron automatically sends it as `Authorization: Bearer <CRON_SECRET>`.
5. Deploy, then trigger the first refresh manually: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/refresh`.

### If Reddit sources show FAILED

Reddit 403s many datacenter/ISP IPs on its public JSON API. Fix for free: create a **script** app at <https://www.reddit.com/prefs/apps>, then set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` env vars. The adapters fall back to app-only OAuth automatically. Without Reddit, Papers/Articles still work from HF + HN; the Discussion tab (Reddit-only) stays hidden from the nav until a refresh fills it.

## Chat (Gemini)

The floating chat button (bottom-right) opens a half-screen bottom sheet — expandable to full screen — with a chatbot grounded in the current radar cache: `/api/chat` injects the top items from every tab into a Gemini system prompt and streams the reply. The API key lives server-side only.

- **Setup**: get a free key at <https://aistudio.google.com/apikey> and set `GEMINI_API_KEY` (in `.env.local` locally; Project → Settings → Environment Variables on Vercel, then redeploy).
- **Quota protection**: when Upstash Redis is configured, chat is rate-limited to 20 messages/IP/hour so one visitor can't drain the shared Gemini free tier (~250–1,000 requests/day on `gemini-2.5-flash`, plus a per-minute cap). Locally (no Redis) there is no limit.
- Model is overridable via `GEMINI_MODEL`.

The Models tab is hidden from the nav (`hiddenInUi: true` in `lib/config.ts`) but its adapters still run: trending models keep appearing in the Today digest's Releases tiles and in the chat's knowledge. Remove the flag to restore the tab; flip `enabled: false` to stop fetching entirely.

## Add to iPhone home screen

Open the deployed URL in Safari → Share → **Add to Home Screen**. It launches fullscreen (standalone PWA) with the radar icon.

## Disable a tab

One line in `lib/config.ts` — flip `enabled: false` on the tab (e.g. `discussion`). The pipeline skips its adapters and the UI hides the tab. Per-tab `windowDays` and signal `weights` are tuned in the same object.

## Notes

- Once-daily refresh is a Hobby-tier cron limit; the ~4-day Discussion window is the tightest fit against it — staleness there is the free tier, not a bug.
- No signal history is stored; every run recomputes scores from a fresh snapshot (no momentum by design).
