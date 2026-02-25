"use client";

import { useState } from "react";
import type { ApiResponse, DraftResponse } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";

export default function DraftsPage() {
  // ─── Form state ─────────────────────────────────────────────────
  const [instructions, setInstructions] = useState("");
  const [clientId, setClientId] = useState("");
  const [includeContext, setIncludeContext] = useState(true);

  // ─── Draft state ─────────────────────────────────────────────────
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [draftText, setDraftText] = useState(""); // user-editable copy
  const [draftSubject, setDraftSubject] = useState("");

  // ─── Refine state ────────────────────────────────────────────────
  const [refineInstructions, setRefineInstructions] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  // ─── UI state ────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Generate new draft ──────────────────────────────────────────

  const generateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructions.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await apiFetch<ApiResponse<DraftResponse>>("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: instructions.trim(),
          clientId: clientId.trim() || undefined,
          includeContext,
        }),
      });
      if (res.success && res.data) {
        setDraft(res.data);
        setDraftText(res.data.draftText);
        setDraftSubject(res.data.subject);
        setRefineInstructions("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate draft");
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Refine existing draft ───────────────────────────────────────

  const refineDraft = async () => {
    if (!refineInstructions.trim() || !draftText) return;
    setIsRefining(true);
    setError(null);
    try {
      const res = await apiFetch<ApiResponse<DraftResponse>>(
        "/api/drafts/refine",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftText,
            instructions: refineInstructions.trim(),
          }),
        },
      );
      if (res.success && res.data) {
        setDraft((prev) => ({
          ...res.data!,
          sources: prev?.sources ?? [],
        }));
        setDraftText(res.data.draftText);
        if (res.data.subject) setDraftSubject(res.data.subject);
        setRefineInstructions("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refine draft");
    } finally {
      setIsRefining(false);
    }
  };

  // ─── Copy to clipboard ───────────────────────────────────────────

  const copyToClipboard = async () => {
    const full = draftSubject
      ? `Subject: ${draftSubject}\n\n${draftText}`
      : draftText;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Email Drafts</h1>
        <p className="text-gray-500 text-sm">
          AI-powered email drafting with context from your synced documents.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left column: inputs ── */}
        <div className="space-y-4">
          {/* Generate form */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Generate Draft</h2>
            <form onSubmit={(e) => void generateDraft(e)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What should the email say?
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Write a follow-up to the client about their GST filing deadline next week, referencing their balance sheet…"
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client ID{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="UUID — restricts context to this client's files"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includeContext"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="includeContext"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  Include relevant context from synced documents
                </label>
              </div>

              <button
                type="submit"
                disabled={isGenerating || !instructions.trim()}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? "Generating…" : "Generate Draft"}
              </button>
            </form>
          </div>

          {/* Refine panel — only visible after first generation */}
          {draft && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3">Refine Draft</h2>
              <div className="space-y-3">
                <textarea
                  value={refineInstructions}
                  onChange={(e) => setRefineInstructions(e.target.value)}
                  placeholder="e.g. Make it shorter, use a more formal tone, mention invoice #1234…"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <button
                  onClick={() => void refineDraft()}
                  disabled={isRefining || !refineInstructions.trim()}
                  className="w-full py-2 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isRefining ? "Refining…" : "Refine Draft"}
                </button>
              </div>
            </div>
          )}

          {/* Context sources */}
          {draft && draft.sources.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3">Context Used</h2>
              <ul className="space-y-2">
                {draft.sources.map((s) => (
                  <li
                    key={s.docId}
                    className="text-xs border border-gray-100 rounded-lg p-3 bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-800 truncate">
                        {s.filename}
                      </span>
                      <span className="text-gray-400 ml-2 shrink-0">
                        {new Date(s.sourceDate).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    <p className="text-gray-500 italic line-clamp-2">
                      {s.excerpt}…
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Right column: draft output ── */}
        <div className="flex flex-col">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          {draft ? (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col flex-1">
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Your Draft</h2>
                <div className="flex items-center gap-3">
                  {draft.metadata && (
                    <span className="text-xs text-gray-400">
                      ₹{draft.metadata.costEstimateInr.toFixed(4)} ·{" "}
                      {draft.metadata.latencyMs}ms
                    </span>
                  )}
                  <button
                    onClick={() => void copyToClipboard()}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                  >
                    {copied ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Subject line */}
              <div className="mb-3">
                <label className="block text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Subject line…"
                />
              </div>

              {/* Body */}
              <div className="flex-1 flex flex-col">
                <label className="block text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                  Body
                </label>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  className="flex-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[320px]"
                  placeholder="Draft body will appear here…"
                />
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center text-center flex-1 min-h-[300px]">
              <div className="text-5xl mb-4">✍️</div>
              <p className="text-sm text-gray-500 max-w-xs">
                Enter your instructions on the left and click{" "}
                <span className="font-medium text-blue-600">
                  Generate Draft
                </span>{" "}
                to create a professional email.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
