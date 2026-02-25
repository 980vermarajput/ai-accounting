import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middleware/error-handler";

const app: Express = express();

// ─── Global Middleware ───────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// ─── Routes ──────────────────────────────────────────
app.use("/api/health", healthRouter);

// ─── Error Handling ──────────────────────────────────
app.use(errorHandler);

export default app;
