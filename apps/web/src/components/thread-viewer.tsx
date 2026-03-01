"use client";

import { useState, useEffect } from "react";
import type { ApiResponse } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";

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
          `/api/documents/thread/${threadId}`
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

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-gray-100 text-gray-700",
      processing: "bg-blue-100 text-blue-700",
      ready: "bg-green-100 text-green-700",
      error: "bg-red-100 text-red-700",
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
          )}
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Gmail Thread</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
          )}
        </div>
        <div className="p-6 text-center">
          <div className="text-red-500 text-2xl mb-2">⚠️</div>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const { messages, dateRange, messageCount } = data;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Gmail Thread</h3>
          <p className="text-sm text-gray-500">
            {messageCount} message{messageCount === 1 ? "" : "s"} •
            {formatDateTime(dateRange.earliest)} to {formatDateTime(dateRange.latest)}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl hover:bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="p-6">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <span className="text-4xl mb-2 block">✉️</span>
            <p className="text-sm">No messages in this thread</p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message, index) => (
              <div key={message.id} className="relative">
                {/* Timeline connector */}
                {index < messages.length - 1 && (
                  <div className="absolute left-4 top-8 w-0.5 h-full bg-gray-200"></div>
                )}

                <div className="flex gap-4">
                  {/* Timeline dot */}
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-blue-600 text-xs font-bold">
                      {index + 1}
                    </span>
                  </div>

                  {/* Message content */}
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-50 rounded-lg p-4">
                      {/* Message header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900 text-sm truncate">
                          {message.filename}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(message.status)}`}>
                            {message.status}
                          </span>
                        </div>
                      </div>

                      {/* Message date */}
                      <div className="text-xs text-gray-500 mb-3">
                        {formatDateTime(message.sourceDate)}
                      </div>

                      {/* Message summary */}
                      {message.summary ? (
                        <div className="mb-3">
                          <div className="text-xs font-medium text-gray-700 mb-1">Summary:</div>
                          <div className="text-sm text-gray-800 bg-white rounded px-3 py-2 border">
                            {message.summary}
                          </div>
                        </div>
                      ) : null}

                      {/* Message excerpt */}
                      {message.textExcerpt && (
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">Excerpt:</div>
                          <div className="text-sm text-gray-600 bg-white rounded px-3 py-2 border italic">
                            "{message.textExcerpt}"
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
      </div>

      {/* Footer with thread ID for debugging */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
        <div className="text-xs text-gray-500 font-mono">
          Thread ID: {threadId}
        </div>
      </div>
    </div>
  );
}