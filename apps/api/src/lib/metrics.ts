import { getRedis } from "./redis";
import { logger } from "./logger";

/**
 * Lightweight metrics collection using Redis
 * Tracks API request metrics, latency, and usage patterns for admin dashboard
 */

interface RequestMetrics {
  route: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  firmId?: string;
  timestamp?: number;
}

/**
 * Record metrics for an API request
 * Called by metrics middleware on every request
 */
export async function recordRequestMetrics({
  route,
  method,
  statusCode,
  latencyMs,
  firmId,
}: RequestMetrics): Promise<void> {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const timestamp = Date.now();

    await Promise.all([
      // Store latency data (keep last 1000 for percentile calculations)
      redis.lpush(`metrics:latency:${route}`, latencyMs),
      redis.ltrim(`metrics:latency:${route}`, 0, 999),

      // Count requests by route, method, status, and date
      redis.incr(`metrics:requests:${route}:${method}:${statusCode}:${today}`),
      redis.expire(`metrics:requests:${route}:${method}:${statusCode}:${today}`, 90 * 24 * 60 * 60), // 90 days

      // Count requests per firm if available
      ...(firmId
        ? [
            redis.incr(`metrics:requests:firm:${firmId}:${today}`),
            redis.expire(`metrics:requests:firm:${firmId}:${today}`, 90 * 24 * 60 * 60),
          ]
        : []),

      // Global request counter
      redis.incr(`metrics:requests:global:${today}`),
      redis.expire(`metrics:requests:global:${today}`, 90 * 24 * 60 * 60),
    ]);
  } catch (error) {
    logger.error("Failed to record request metrics", {
      error: error instanceof Error ? error.message : String(error),
      route,
      method,
    });
  }
}

/**
 * Calculate P95 latency for a specific route
 */
export async function getP95Latency(route: string): Promise<number> {
  try {
    const redis = getRedis();
    const latencies = await redis.lrange(`metrics:latency:${route}`, 0, -1);

    if (latencies.length === 0) return 0;

    const nums = latencies.map(Number).sort((a, b) => a - b);
    const p95Index = Math.ceil(nums.length * 0.95) - 1;
    return nums[p95Index] || 0;
  } catch (error) {
    logger.error("Failed to get P95 latency", {
      error: error instanceof Error ? error.message : String(error),
      route,
    });
    return 0;
  }
}

/**
 * Get daily request counts for a route over specified days
 */
export async function getDailyRequestCount(
  route: string,
  days: number = 7,
): Promise<{ date: string; count: number }[]> {
  try {
    const redis = getRedis();
    const results: { date: string; count: number }[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const pattern = `metrics:requests:${route}:*:*:${dateStr}`;
      const keys = await redis.keys(pattern);

      let totalCount = 0;
      if (keys.length > 0) {
        const counts = await redis.mget(...keys);
        totalCount = counts.reduce((sum, count) => sum + (parseInt(String(count || "0"), 10)), 0);
      }

      results.push({ date: dateStr, count: totalCount });
    }

    return results.reverse(); // Return chronological order
  } catch (error) {
    logger.error("Failed to get daily request count", {
      error: error instanceof Error ? error.message : String(error),
      route,
    });
    return [];
  }
}

/**
 * Get global platform metrics for admin dashboard
 */
export async function getGlobalMetrics(): Promise<{
  totalRequestsToday: number;
  totalRequestsLast30Days: number;
  p95LatencyMs: number;
  topRoutesByRequests: Array<{ route: string; requests: number }>;
}> {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().split("T")[0];

    // Get today's requests
    const todayKey = `metrics:requests:global:${today}`;
    const totalRequestsToday = parseInt(String((await redis.get(todayKey)) || "0"), 10);

    // Get last 30 days requests
    let totalRequestsLast30Days = 0;
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayCount = parseInt(String((await redis.get(`metrics:requests:global:${dateStr}`)) || "0"), 10);
      totalRequestsLast30Days += dayCount;
    }

    // Get P95 latency across all routes (sample from main routes)
    const mainRoutes = ["/api/chat", "/api/documents", "/api/clients"];
    const latencies: number[] = [];

    for (const route of mainRoutes) {
      const routeLatencies = await redis.lrange(`metrics:latency:${route}`, 0, 99); // Sample 100
      latencies.push(...routeLatencies.map(Number));
    }

    latencies.sort((a, b) => a - b);
    const p95LatencyMs = latencies.length > 0
      ? latencies[Math.ceil(latencies.length * 0.95) - 1] || 0
      : 0;

    // Get top routes by request count (today)
    const routeKeys = await redis.keys(`metrics:requests:*:*:*:${today}`);
    const routeCounts: { [key: string]: number } = {};

    for (const key of routeKeys) {
      const parts = key.split(":");
      if (parts.length >= 4) {
        const route = parts[2]; // Extract route part
        const count = parseInt(String((await redis.get(key)) || "0"), 10);
        routeCounts[route] = (routeCounts[route] || 0) + count;
      }
    }

    const topRoutesByRequests = Object.entries(routeCounts)
      .map(([route, requests]) => ({ route, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      totalRequestsToday,
      totalRequestsLast30Days,
      p95LatencyMs,
      topRoutesByRequests,
    };
  } catch (error) {
    logger.error("Failed to get global metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      totalRequestsToday: 0,
      totalRequestsLast30Days: 0,
      p95LatencyMs: 0,
      topRoutesByRequests: [],
    };
  }
}

/**
 * Get per-firm request metrics
 */
export async function getFirmRequestMetrics(
  firmId: string,
  days: number = 30,
): Promise<{ date: string; requests: number }[]> {
  try {
    const redis = getRedis();
    const results: { date: string; requests: number }[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const count = parseInt(
        String((await redis.get(`metrics:requests:firm:${firmId}:${dateStr}`)) || "0"),
        10
      );

      results.push({ date: dateStr, requests: count });
    }

    return results.reverse(); // Chronological order
  } catch (error) {
    logger.error("Failed to get firm request metrics", {
      error: error instanceof Error ? error.message : String(error),
      firmId,
    });
    return [];
  }
}