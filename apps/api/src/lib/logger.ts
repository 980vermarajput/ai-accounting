/**
 * Structured logging for observability and monitoring.
 *
 * Provides structured JSON logging with different levels and contexts
 * for better debugging and production monitoring.
 */

export interface LogContext {
  firmId?: string;
  userId?: string;
  requestId?: string;
  operation?: string;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

class Logger {
  private env = process.env.NODE_ENV || "development";
  private serviceName = "ai-accounting-api";

  private log(level: string, message: string, context: LogContext = {}): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...context,
    };

    if (this.env === "development") {
      // Human-readable format for development
      const contextStr = Object.keys(context).length > 0
        ? ` | ${JSON.stringify(context)}`
        : "";
      console.log(`[${level.toUpperCase()}] ${message}${contextStr}`);
    } else {
      // Structured JSON for production
      console.log(JSON.stringify(logEntry));
    }
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  debug(message: string, context?: LogContext): void {
    if (this.env === "development") {
      this.log("debug", message, context);
    }
  }

  // Specialized logging methods for common operations

  ragQuery(context: {
    firmId: string;
    userId: string;
    query: string;
    chunksRetrieved: number;
    chunksUsed: number;
    tokens: number;
    cost: number;
    latency: number;
    cached: boolean;
  }): void {
    this.info("RAG query completed", {
      ...context,
      operation: "rag_query",
      type: "performance_metric"
    });
  }

  tokenUsage(context: {
    firmId: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costInr: number;
    sourceOperation: string;
  }): void {
    this.info("Token usage recorded", {
      ...context,
      operation: "token_usage",
      type: "cost_metric"
    });
  }

  syncJob(context: {
    firmId: string;
    userId: string;
    jobType: "gmail" | "drive";
    status: string;
    documentsFound?: number;
    documentsProcessed?: number;
    duration?: number;
    error?: string;
  }): void {
    this.info("Sync job update", {
      ...context,
      operation: "sync_job",
      type: "job_metric"
    });
  }

  authEvent(context: {
    userId?: string;
    firmId?: string;
    event: "login" | "logout" | "token_refresh" | "auth_failure";
    reason?: string;
    ipAddress?: string;
  }): void {
    this.info("Authentication event", {
      ...context,
      operation: "auth_event",
      type: "security_metric"
    });
  }

  businessMetric(context: {
    firmId?: string;
    metric: string;
    value: number;
    unit?: string;
    [key: string]: unknown;
  }): void {
    this.info("Business metric recorded", {
      ...context,
      operation: "business_metric",
      type: "business_metric"
    });
  }
}

export const logger = new Logger();