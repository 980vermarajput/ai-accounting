import Redis from "ioredis";

// BullMQ requires maxRetriesPerRequest: null on the connection.
// We share a single ioredis instance across all queues and workers.

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    _redis.on("error", (err: Error) => {
      console.error("[Redis] Connection error:", err.message);
    });

    _redis.on("connect", () => {
      console.log("[Redis] Connected");
    });
  }

  return _redis;
}
