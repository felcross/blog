import { Redis } from "ioredis";
import { env } from "../config/env.js";

let shared: Redis | undefined;

/**
 * Shared Redis connection for BullMQ.
 * Workers require maxRetriesPerRequest: null.
 */
export function getRedisConnection(): Redis {
  if (!shared) {
    shared = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return shared;
}

export async function closeRedisConnection(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = undefined;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const conn = getRedisConnection();
    const pong = await Promise.race([
      conn.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis ping timeout")), 1500),
      ),
    ]);
    return pong === "PONG";
  } catch {
    return false;
  }
}
