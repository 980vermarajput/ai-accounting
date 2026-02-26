"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { apiFetch } from "../../../lib/api";
import type {
  ApiResponse,
  ChatResponse,
  ChatSource,
  ConfidenceInfo,
  PaginatedResponse,
} from "@ai-accounting/shared";

// ─── Local types ─────────────────────────────────────────────────

interface HistoryItem {
  id: string;
  queryText: string;
  createdAt: string;
}

type UserMsg = {
  id: string;
  role: "user";
  content: string;
};

type AssistantMsg = {
  id: string;
  role: "assistant";
  content: string;
  sources: ChatSource[];
  followups: string[];
  queryId: string;
  latencyMs: number;
  confidence: ConfidenceInfo;
  cached: boolean;
};

type ErrorMsg = {
  id: string;
  role: "error";
  content: string;
};

type Message = UserMsg | AssistantMsg | ErrorMsg;

// ─── Helpers ─────────────────────────────────────────────────────

function uid() {
  return typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─── Source card ─────────────────────────────────────────────────

function SourceCard({ source }: { source: ChatSource }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800 truncate leading-tight">
          {source.filename}
        </span>
        <span className="text-gray-400 shrink-0 whitespace-nowrap">
          {fmtDate(source.sourceDate)}
        </span>
      </div>
      <p className="text-gray-500 line-clamp-2 leading-relaxed">
        {source.excerpt}
      </p>
      <span className="inline-block px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 font-medium">
        {Math.round(source.relevanceScore * 100)}% match
      </span>
    </div>
  );
}

// ─── WhatsApp format helper ──────────────────────────────────────

function formatForWhatsApp(content: string, sources: ChatSource[]): string {
  let text = content;
  if (sources.length > 0) {
    text += "\n\n" + "─".repeat(20);
    text += `\n_Sources (${sources.length}):_`;
    sources.forEach((s) => {
      text += `\n• ${s.filename} (${fmtDate(s.sourceDate)})`;
    });
  }
  text += "\n\n_— AI Assistant for Accountants_";
  return text;
}

const CONFIDENCE_STYLES = {
  high: {
    emoji: "🟢",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  medium: {
    emoji: "🟡",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
  },
  low: {
    emoji: "🔴",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
} as const;

const CONFIDENCE_LABELS = {
  high: "High Confidence — Based on closely matching documents",
  medium: "Medium Confidence — Based on partially matching records",
  low: "Low Confidence — Limited supporting documents",
} as const;

// ─── Message bubble ──────────────────────────────────────────────

function MessageBubble({
  message,
  isLast,
  onFollowup,
}: {
  message: Message;
  isLast: boolean;
  onFollowup: (q: string) => void;
}) {
  const [showSources, setShowSources] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary-600 text-white px-4 py-3 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
          !
        </div>
        <div className="flex-1 rounded-2xl rounded-tl-sm bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  const hasSources = message.sources.length > 0;
  const conf = CONFIDENCE_STYLES[message.confidence.level];
  const confLabel = CONFIDENCE_LABELS[message.confidence.level];
  const [copied, setCopied] = useState(false);

  const handleWhatsAppCopy = () => {
    const text = formatForWhatsApp(message.content, message.sources);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        AI
      </div>

      <div className="flex-1 space-y-3 min-w-0">
        {/* Confidence badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${conf.bg} ${conf.text} ${conf.border}`}
          >
            {conf.emoji} {confLabel}
          </span>
          {message.cached && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
              ⚡ Cached
            </span>
          )}
        </div>

        {/* Answer */}
        <div className="rounded-2xl rounded-tl-sm bg-white border border-gray-200 px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleWhatsAppCopy}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            title="Copy formatted for WhatsApp"
          >
            {copied ? <>✅ Copied!</> : <>📱 Copy </>}
          </button>
        </div>

        {/* Sources toggle */}
        {hasSources && (
          <div className="space-y-2">
            <button
              onClick={() => setShowSources((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span
                className={`transition-transform ${showSources ? "rotate-90" : ""}`}
              >
                ▶
              </span>
              {showSources ? "Hide" : "Show"} {message.sources.length} source
              {message.sources.length > 1 ? "s" : ""}
            </button>

            {showSources && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.sources.map((src) => (
                  <SourceCard key={src.docId} source={src} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Follow-up chips — only on last assistant message */}
        {isLast && message.followups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.followups.map((q) => (
              <button
                key={q}
                onClick={() => onFollowup(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Latency */}
        <p className="text-xs text-gray-400">{fmtMs(message.latencyMs)}</p>
      </div>
    </div>
  );
}

// ─── Thinking indicator ──────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
        AI
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-white border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Chat page ───────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load chat history ───────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<PaginatedResponse<HistoryItem>>(
        "/api/chat/history?pageSize=30",
      );
      setHistory(res.data ?? []);
    } catch {
      /* silent — history is non-critical */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking]);

  // ── Submit query ─────────────────────────────────────────────
  const submit = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q || isAsking) return;

      setMessages((prev) => [...prev, { id: uid(), role: "user", content: q }]);
      setInput("");
      setIsAsking(true);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      try {
        const res = await apiFetch<ApiResponse<ChatResponse>>("/api/chat", {
          method: "POST",
          body: JSON.stringify({ query: q }),
        });

        const data = res.data!;
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            followups: data.suggestedFollowups,
            queryId: data.queryId,
            latencyMs: data.metadata.latencyMs,
            confidence: data.confidence,
            cached: data.metadata.cached,
          },
        ]);

        void loadHistory(); // refresh sidebar after a new query is stored
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "error",
            content:
              err instanceof Error
                ? err.message
                : "Something went wrong. Please try again.",
          },
        ]);
      } finally {
        setIsAsking(false);
        textareaRef.current?.focus();
      }
    },
    [isAsking, loadHistory],
  );

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  };

  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const lastAssistantIndex = [...messages]
    .reverse()
    .findIndex((m) => m.role === "assistant");
  const lastAssistantId =
    lastAssistantIndex >= 0
      ? messages[messages.length - 1 - lastAssistantIndex].id
      : null;

  return (
    <div className="flex h-full">
      {/* ── History sidebar ─────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Recent queries
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8 px-4">
              No queries yet. Ask something below!
            </p>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => setInput(item.queryText)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors group"
              >
                <p className="text-xs text-gray-700 leading-snug line-clamp-2 group-hover:text-gray-900">
                  {item.queryText}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDate(item.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          <button
            onClick={() => setMessages([])}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            + New conversation
          </button>
        </div>
      </aside>

      {/* ── Main chat area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && !isAsking && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 text-xl flex items-center justify-center">
                💬
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-700">
                  Ask about your documents
                </h2>
                <p className="text-sm text-gray-400 mt-1 max-w-sm">
                  Search across all synced emails, invoices, ledgers, and
                  spreadsheets. Get answers with source citations.
                </p>
              </div>
              {/* Compliance template chips */}
              <div className="flex flex-wrap gap-2 justify-center mt-4 max-w-lg">
                {[
                  "Show all outstanding invoices",
                  "Pending TDS certificates for this quarter",
                  "GST filing status summary",
                  "Latest communication summary with clients",
                  "Unpaid invoices above ₹1 lakh",
                  "Upcoming compliance deadlines",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => void submit(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={msg.id === lastAssistantId}
              onFollowup={(q) => void submit(q)}
            />
          ))}

          {isAsking && <ThinkingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-end gap-3 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400 transition-all"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your clients' documents… (Enter to send)"
              disabled={isAsking}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isAsking}
              className="shrink-0 w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 active:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-400 text-center">
            Answers are grounded in your synced documents. Always verify with
            source material.
          </p>
        </div>
      </div>
    </div>
  );
}
