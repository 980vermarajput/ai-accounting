import type { Request, Response } from "express";
import { Router } from "express";

export const healthRouter: Router = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      service: "ai-accounting-api",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    },
  });
});
