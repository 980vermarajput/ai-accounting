import type { Request, Response, NextFunction } from "express";
import { recordRequestMetrics } from "../lib/metrics";

/**
 * Metrics collection middleware
 * Records latency and request counts for all API endpoints
 * Used by admin dashboard for platform monitoring
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  // Capture the original end method
  const originalEnd = res.end;

  // Override the end method to capture metrics
  res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
    const latencyMs = Date.now() - startTime;
    const route = extractRoute(req.path);
    const firmId = req.user?.firmId;

    // Record metrics async (don't block response)
    recordRequestMetrics({
      route,
      method: req.method,
      statusCode: res.statusCode,
      latencyMs,
      firmId,
    }).catch((error) => {
      console.error("Failed to record metrics:", error);
    });

    // Call original end method
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
}

/**
 * Extract normalized route from request path
 * Removes query params and normalizes dynamic segments
 */
function extractRoute(path: string): string {
  // Remove query parameters
  const basePath = path.split("?")[0];

  // Normalize common dynamic routes
  return basePath
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id") // UUIDs
    .replace(/\/[0-9]+/g, "/:id") // Numeric IDs
    .replace(/\/cuid[a-z0-9]{20}/gi, "/:id") // CUID IDs
    .replace(/\/[a-z0-9]{64}/gi, "/:token") // Tokens
    || "/";
}