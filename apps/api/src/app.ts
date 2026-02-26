import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { documentsRouter } from "./routes/documents";
import { chatRouter } from "./routes/chat";
import { syncRouter } from "./routes/sync";
import { draftsRouter } from "./routes/drafts";
import { errorHandler } from "./middleware/error-handler";
import { clientsRouter } from "./routes/clients";

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
app.use(cookieParser());
app.use(morgan("dev"));

// ─── Routes ──────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/sync", syncRouter);
app.use("/api/drafts", draftsRouter);
app.use("/api/clients", clientsRouter);

// ─── 404 catch-all ───────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

// ─── Error Handling ──────────────────────────────────
app.use(errorHandler);

export default app;
