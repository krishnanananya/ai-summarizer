import type { CachedBlob } from "./types";
import type { LlmSnapshot } from "./llmHistory";

const KEY = "radar:results";
const HISTORY_KEY = "radar:llm-history";

// Upstash Redis in production (Vercel Marketplace, free tier); local JSON file
// fallback for dev so the app runs with zero accounts configured.
function hasRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

const FILE_PATH = ".cache/results.json";
const HISTORY_FILE_PATH = ".cache/llm-history.json";

async function readKey<T>(key: string, file: string): Promise<T | null> {
  try {
    if (hasRedis()) {
      return (await (await redis()).get<T>(key)) ?? null;
    }
    const { readFile } = await import("fs/promises");
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeKey<T>(key: string, file: string, value: T): Promise<void> {
  if (hasRedis()) {
    await (await redis()).set(key, value);
    return;
  }
  const { mkdir, writeFile } = await import("fs/promises");
  await mkdir(".cache", { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2));
}

// Guards against overlapping pipeline runs when refresh triggers race
// (cron + the in-app button). Redis NX lock in prod; module state in dev
// (single process, good enough).
const LOCK_KEY = "radar:refresh-lock";
let localLockUntil = 0;

export async function acquireRefreshLock(ttlSeconds = 120): Promise<boolean> {
  if (hasRedis()) {
    const ok = await (await redis()).set(LOCK_KEY, "1", {
      nx: true,
      ex: ttlSeconds,
    });
    return ok === "OK";
  }
  const now = Date.now();
  if (now < localLockUntil) return false;
  localLockUntil = now + ttlSeconds * 1000;
  return true;
}

export async function releaseRefreshLock(): Promise<void> {
  try {
    if (hasRedis()) await (await redis()).del(LOCK_KEY);
    else localLockUntil = 0;
  } catch {
    /* lock has a TTL; failing to release is harmless */
  }
}

export async function readCache(): Promise<CachedBlob | null> {
  return readKey<CachedBlob>(KEY, FILE_PATH);
}

export async function writeCache(blob: CachedBlob): Promise<void> {
  return writeKey(KEY, FILE_PATH, blob);
}

export async function readLlmHistory(): Promise<LlmSnapshot[]> {
  return (await readKey<LlmSnapshot[]>(HISTORY_KEY, HISTORY_FILE_PATH)) ?? [];
}

export async function writeLlmHistory(history: LlmSnapshot[]): Promise<void> {
  return writeKey(HISTORY_KEY, HISTORY_FILE_PATH, history);
}
