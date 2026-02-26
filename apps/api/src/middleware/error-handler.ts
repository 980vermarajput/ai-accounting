import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@ai-accounting/shared";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("Unhandled error:", err);

  const statusCode = (err as any).statusCode || 500;
  const response: ApiResponse = {
    success: false,
    error: {
      code: (err as any).code || "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
    },
  };

  res.status(statusCode).json(response);
}
