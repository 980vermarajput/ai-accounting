"use client";

import { useState, useEffect } from "react";
import type { ApiResponse } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, fmtDateTime } from "@/lib/utils";
import { X, Mail, AlertTriangle, MessageSquare } from "lucide-react";

// Types based on the API endpoint implementation
interface ThreadSummaryResponse {
  threadId: string;
  messageCount: number;
  messages: Array<{
    id: string;
    filename: string;
    sourceId: string;
    textExcerpt: string;
    sourceDate: string;
    status: "pending" | "processing" | "ready" | "error";
    summary?: string;
  }>;
  dateRange: {
    earliest: string;
    latest: string;
  };
}

interface ThreadViewerProps {
  threadId: string;
  onClose?: () => void;
}

export function ThreadViewer({ threadId, onClose }: ThreadViewerProps) {
  const [data, setData] = useState<ThreadSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchThreadSummary = async () => {
      try {
        const res = await apiFetch<ApiResponse<ThreadSummaryResponse>>(
          `/api/documents/thread/${threadId}`,
        );
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError("Thread not found or no messages");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchThreadSummary();
  }, [threadId]);

  if (isLoading) {
    return (
      <Card className="shadow-card overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border-light">
          <div className="animate-pulse">
            <div className="h-6 bg-surface-secondary rounded w-48 mb-2"></div>
            <div className="h-4 bg-surface-secondary rounded w-32"></div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </CardHeader>
        <CardContent className="p-6 flex items-center justify-center py-12">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="shadow-card overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border-light">
          <CardTitle>Gmail Thread</CardTitle>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </CardHeader>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600 text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const { messages, dateRange, messageCount } = data;

  return (
    <Card className="shadow-card overflow-hidden">
      {/* Header */}
      <CardHeader className="flex flex-row items-center justify-between border-b border-border-light">
        <div>
          <CardTitle className="mb-1">Gmail Thread</CardTitle>
          <p className="text-sm text-muted">
            {messageCount} message{messageCount === 1 ? "" : "s"} •{" "}
            {fmtDateTime(dateRange.earliest)} to {fmtDateTime(dateRange.latest)}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground bg-surface-tertiary hover:bg-surface-secondary w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </CardHeader>

      {/* Messages */}
      <CardContent className="p-6">
        {messages.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-10 w-10" />}
            title="No messages in this thread"
          />
        ) : (
          <div className="space-y-6">
            {messages.map((message, index) => (
              <div key={message.id} className="relative">
                {/* Timeline connector */}
                {index < messages.length - 1 && (
                  <div className="absolute left-4 top-8 w-0.5 h-full bg-border-light"></div>
                )}

                <div className="flex gap-4">
                  {/* Timeline dot */}
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-primary-600 text-xs font-bold">
                      {index + 1}
                    </span>
                  </div>

                  {/* Message content */}
                  <div className="flex-1 min-w-0">
                    <div className="bg-surface-tertiary rounded-lg p-4 border border-border">
                      {/* Message header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm truncate">
                          {message.filename}
                        </div>
                        <StatusBadge status={message.status} />
                      </div>

                      {/* Message date */}
                      <div className="text-xs text-muted mb-3">
                        {fmtDateTime(message.sourceDate)}
                      </div>

                      {/* Message summary */}
                      {message.summary ? (
                        <div className="mb-3">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Summary:
                          </div>
                          <div className="text-sm bg-surface rounded px-3 py-2 border border-border-light">
                            {message.summary}
                          </div>
                        </div>
                      ) : null}

                      {/* Message excerpt */}
                      {message.textExcerpt && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Excerpt:
                          </div>
                          <div className="text-sm text-muted-foreground bg-surface rounded px-3 py-2 border border-border-light italic">
                            &ldquo;{message.textExcerpt}&rdquo;
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Footer with thread ID for debugging */}
      <div className="px-6 py-3 bg-surface-tertiary border-t border-border-light">
        <div className="text-xs text-muted font-mono">Thread ID: {threadId}</div>
      </div>
    </Card>
  );
}
