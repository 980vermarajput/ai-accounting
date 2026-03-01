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
import { adminRouter } from "./routes/admin";
import { dashboardRouter } from "./routes/dashboard";

const app: Express = express();

// ─── Global Middleware ───────────────────────────────
// Enhanced security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

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
app.use("/api/admin", adminRouter);
app.use("/api/dashboard", dashboardRouter);

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
