// src/lib/cache.ts
import { Redis } from "@upstash/redis";

type MemoryStore = Map<string, { exp: number; val: unknown }>;
type CacheClient =
  | { type: "redis"; client: Redis }
  | { type: "memory"; store: MemoryStore };
const fallbackStore: MemoryStore = new Map<string, { exp: number; val: unknown }>();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const client: CacheClient =
  redisUrl && redisToken
    ? { type: "redis", client: new Redis({ url: redisUrl, token: redisToken }) }
    : { type: "memory", store: new Map<string, { exp: number; val: unknown }>() };

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  if (client.type === "redis") {
    try {
      const v = await client.client.get<T>(key);
      if (v != null) return v as T;
    } catch {
      // ignore and fallback to in-memory cache
    }
    const memHit = fallbackStore.get(key);
    if (!memHit) return null;
    if (Date.now() > memHit.exp) {
      fallbackStore.delete(key);
      return null;
    }
    return memHit.val as T;
  }
  const hit = client.store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    client.store.delete(key);
    return null;
  }
  return hit.val as T;
}

export async function setCache<T = unknown>(key: string, value: T, ttlSec: number): Promise<void> {
  if (client.type === "redis") {
    try {
      await client.client.set(key, value, { ex: ttlSec });
    } catch {
      // ignore and fallback to in-memory cache
      fallbackStore.set(key, { exp: Date.now() + ttlSec * 1000, val: value });
    }
  } else {
    client.store.set(key, { exp: Date.now() + ttlSec * 1000, val: value });
  }
}

export function buildKey(prefix: string, obj: unknown) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj);
  const h = Array.from(new TextEncoder().encode(s)).reduce((a, b) => ((a * 33) ^ b) >>> 0, 5381).toString(16);
  return `${prefix}:${h}`;
}

/** 先查快取；miss 才跑 fetcher；?nocache=1 可跳過快取 */
export async function cacheFetchJSON<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
  forceNoCache: boolean,
  shouldCache?: (data: T) => boolean
): Promise<T> {
  if (!forceNoCache) {
    const hit = await getCache<T>(key);
    if (hit != null) return hit;
  }
  const data = await fetcher();
  const okToCache = shouldCache ? shouldCache(data) : true;
  if (okToCache) {
    await setCache(key, data, ttlSec);
  }
  return data;
}
