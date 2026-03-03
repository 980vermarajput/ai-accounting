"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { cn, fmtDate, fmtMs, uid } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { Spinner } from "@/components/ui";
import {
  Send,
  Copy,
  Check,
  ChevronRight,
  RefreshCw,
  Upload,
  Zap,
  FileText,
  MessageSquarePlus,
  User,
  Smartphone,
} from "lucide-react";
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
  chunksRetrieved: number;
  chunksUsed: number;
  toolsUsed?: string[];
  multiStepThinking?: boolean;
};

type ErrorMsg = {
  id: string;
  role: "error";
  content: string;
};

type Message = UserMsg | AssistantMsg | ErrorMsg;

// ─── Source card ─────────────────────────────────────────────────

function SourceCard({ source }: { source: ChatSource }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3 space-y-1.5 text-xs hover:shadow-card transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800 truncate leading-tight">
          {source.filename}
        </span>
        <span className="text-muted-foreground shrink-0 whitespace-nowrap">
          {fmtDate(source.sourceDate)}
        </span>
      </div>
      <p className="text-muted line-clamp-2 leading-relaxed">{source.excerpt}</p>
      <Badge variant="primary" className="text-[10px]">
        {Math.round(source.relevanceScore * 100)}% match
      </Badge>
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
    variant: "success" as const,
    label: "High Confidence",
  },
  medium: {
    variant: "warning" as const,
    label: "Medium Confidence",
  },
  low: {
    variant: "danger" as const,
    label: "Low Confidence",
  },
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
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gray-900 text-white px-4 py-3 text-sm leading-relaxed">
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
      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
        AI
      </div>

      <div className="flex-1 space-y-2.5 min-w-0">
        {/* Confidence & meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={conf.variant}>{conf.label}</Badge>
          {message.cached && (
            <Badge variant="info">
              <Zap className="h-3 w-3" /> Cached
            </Badge>
          )}
          {message.multiStepThinking && (
            <Badge variant="success">
              <RefreshCw className="h-3 w-3" /> Multi-step
            </Badge>
          )}
          {message.chunksRetrieved > 0 && (
            <span className="text-[11px] text-muted-foreground">
              <FileText className="inline h-3 w-3 mr-0.5" />
              {message.chunksRetrieved} searched · {message.chunksUsed} used
            </span>
          )}
        </div>

        {/* Answer */}
        <div className="rounded-xl rounded-tl-sm bg-white border border-border px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap shadow-card">
          {message.content}
        </div>


        {/* Action buttons row */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleWhatsAppCopy}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-white text-muted hover:bg-surface-tertiary hover:text-gray-700 transition-colors"
            title="Copy formatted for WhatsApp"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" /> Copied!
              </>
            ) : (
              <>
                <Smartphone className="h-3 w-3" /> Copy
              </>
            )}
          </button>
        </div>

        {/* Sources toggle */}
        {hasSources && (
          <div className="space-y-2">
            <button
              onClick={() => setShowSources((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-700 transition-colors"
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", showSources && "rotate-90")}
              />
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
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-white text-gray-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Latency */}
        <p className="text-[11px] text-muted-foreground">{fmtMs(message.latencyMs)}</p>
      </div>
    </div>
  );
}

// ─── Thinking indicator ──────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
        AI
      </div>
      <div className="rounded-xl rounded-tl-sm bg-white border border-border px-4 py-3 shadow-card">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
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
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<{
    name: string;
    emailDomain?: string;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Persist session ID to localStorage
  useEffect(() => {
    // Load session ID from localStorage on mount
    const savedSessionId = localStorage.getItem('chat-session-id');
    if (savedSessionId) {
      setSessionId(savedSessionId);
    }
  }, []);

  // Save session ID to localStorage when it changes
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('chat-session-id', sessionId);
    }
  }, [sessionId]);

  // Load conversation history when session ID is restored
  useEffect(() => {
    const loadSessionMessages = () => {
      if (sessionId) {
        // Load messages from localStorage for this session
        const savedMessages = localStorage.getItem(`chat-messages-${sessionId}`);
        if (savedMessages) {
          try {
            const parsedMessages = JSON.parse(savedMessages);
            // Ensure all messages have the required properties to avoid undefined errors
            const validatedMessages = parsedMessages.map((msg: any) => ({
              ...msg,
              // Add default values for any missing properties
              toolsUsed: msg.toolsUsed || [],
              multiStepThinking: msg.multiStepThinking || false,
              cached: msg.cached || false,
              chunksRetrieved: msg.chunksRetrieved || 0,
              chunksUsed: msg.chunksUsed || 0,
            }));
            setMessages(validatedMessages);
          } catch {
            // Invalid JSON, clear this session's cache
            localStorage.removeItem(`chat-messages-${sessionId}`);
          }
        }
      }
    };

    loadSessionMessages();
  }, [sessionId]);

  // Save messages to localStorage when they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chat-messages-${sessionId}`, JSON.stringify(messages));
    }
  }, [sessionId, messages]);

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

  // ── Load client info if clientId is provided ────────────────
  useEffect(() => {
    const loadClientInfo = async () => {
      if (!clientId) return;

      try {
        const res = await apiFetch<
          ApiResponse<{ client: { name: string; emailDomain?: string } }>
        >(`/api/clients/${clientId}/summary`);
        if (res.success && res.data) {
          setClientInfo({
            name: res.data.client.name,
            emailDomain: res.data.client.emailDomain,
          });
        }
      } catch {
        // Silent fail - client context is optional
      }
    };

    void loadClientInfo();
  }, [clientId]);

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
          body: JSON.stringify({
            query: q,
            ...(sessionId && { sessionId }),
            ...(clientId && { clientId }),
          }),
        });

        const data = res.data!;

        // Update session ID for conversation continuity
        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: data.answer,
            sources: data.sources || [],
            followups: data.suggestedFollowups || [],
            queryId: data.queryId,
            latencyMs: data.metadata?.latencyMs || 0,
            confidence: data.confidence || { level: "medium", score: 0.5 },
            cached: data.metadata?.cached || false,
            chunksRetrieved: data.metadata?.chunksRetrieved || 0,
            chunksUsed: data.metadata?.chunksUsed || 0,
            toolsUsed: data.metadata?.toolsUsed || [],
            multiStepThinking: data.metadata?.multiStepThinking || false,
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
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/50 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200/50 bg-white/60">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Recent queries
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8 px-4">
              No queries yet. Ask something below!
            </p>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => setInput(item.queryText)}
                className="w-full text-left px-4 py-2.5 hover:bg-white/60 hover:shadow-sm transition-all group rounded-lg mx-2"
              >
                <p className="text-xs text-slate-700 leading-snug line-clamp-2 group-hover:text-slate-900">
                  {item.queryText}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {fmtDate(item.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-slate-200/50 px-4 py-3 bg-white/40">
          <button
            onClick={() => {
              setMessages([]);
              setSessionId(null);
              // Clear ALL localStorage for chat functionality
              localStorage.removeItem('chat-session-id');
              // Clear any cached messages
              const keys = Object.keys(localStorage);
              keys.forEach(key => {
                if (key.startsWith('chat-messages-')) {
                  localStorage.removeItem(key);
                }
              });
              // Force a page reload to clear any cached state
              window.location.reload();
            }}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 transition-colors"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New conversation
          </button>
        </div>
      </aside>

      {/* ── Main chat area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Client Context Banner */}
        {clientInfo && (
          <div className="bg-primary-50 border-b border-primary-100 px-6 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-3.5 w-3.5 text-primary-600" />
              <span className="text-primary-800 font-medium">
                Asking about: {clientInfo.name}
              </span>
              {clientInfo.emailDomain && (
                <span className="text-primary-600 text-xs">
                  ({clientInfo.emailDomain})
                </span>
              )}
              <span className="text-primary-500 text-xs ml-auto">
                Scoped to this client&apos;s documents
              </span>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 custom-scrollbar">
          {messages.length === 0 && !isAsking && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-surface-tertiary flex items-center justify-center">
                <MessageSquarePlus className="h-6 w-6 text-muted" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">
                  Ask about your documents
                </h2>
                <p className="text-sm text-muted mt-1 max-w-sm">
                  Search across synced emails, invoices, ledgers, and spreadsheets. Get
                  answers with source citations.
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
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-white text-gray-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors"
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
        <div className="border-t border-border bg-white px-6 py-4">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-end gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-3 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all"
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
              className="shrink-0 w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 active:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Answers are grounded in your synced documents. Always verify with source
            material.
          </p>
        </div>
      </div>
    </div>
  );
}
