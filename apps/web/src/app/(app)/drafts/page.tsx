"use client";

import { useState } from "react";
import type {
  ApiResponse,
  DraftResponse,
  GmailDraftResponse,
} from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import { cn, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { FlashMessage } from "@/components/ui/flash-message";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Send,
  Copy,
  Check,
  PenLine,
  RefreshCw,
  Mail,
  Sparkles,
  FileText,
} from "lucide-react";

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

  // ─── Gmail send state ────────────────────────────────────────────
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [gmailResult, setGmailResult] = useState<GmailDraftResponse | null>(null);

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
      const res = await apiFetch<ApiResponse<DraftResponse>>("/api/drafts/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftText,
          instructions: refineInstructions.trim(),
        }),
      });
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
    const full = draftSubject ? `Subject: ${draftSubject}\n\n${draftText}` : draftText;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Save to Gmail as draft ──────────────────────────────────────

  const sendToGmail = async () => {
    if (!recipientEmail.trim() || !draftText.trim()) return;
    setIsSending(true);
    setError(null);
    setGmailResult(null);
    try {
      const res = await apiFetch<ApiResponse<GmailDraftResponse>>("/api/drafts/send", {
        method: "POST",
        body: JSON.stringify({
          to: recipientEmail.trim(),
          subject: draftSubject || "(no subject)",
          body: draftText,
        }),
      });
      if (res.success && res.data) {
        setGmailResult(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft to Gmail");
    } finally {
      setIsSending(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Email Drafts"
        description="AI-powered email drafting with context from your synced documents."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left column: inputs ── */}
        <div className="space-y-4">
          {/* Generate form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted" />
                Generate Draft
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void generateDraft(e)} className="space-y-4">
                <Textarea
                  label="What should the email say?"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Write a follow-up to the client about their GST filing deadline next week, referencing their balance sheet…"
                  rows={4}
                />

                <Input
                  label="Client ID"
                  hint="Optional — restricts context to this client's files"
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="UUID"
                />

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeContext"
                    checked={includeContext}
                    onChange={(e) => setIncludeContext(e.target.checked)}
                    className="rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <label
                    htmlFor="includeContext"
                    className="text-sm text-gray-700 cursor-pointer"
                  >
                    Include relevant context from synced documents
                  </label>
                </div>

                <Button
                  type="submit"
                  disabled={isGenerating || !instructions.trim()}
                  loading={isGenerating}
                  className="w-full"
                >
                  <Send className="h-4 w-4" />
                  {isGenerating ? "Generating…" : "Generate Draft"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Refine panel — only visible after first generation */}
          {draft && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted" />
                  Refine Draft
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={refineInstructions}
                  onChange={(e) => setRefineInstructions(e.target.value)}
                  placeholder="e.g. Make it shorter, use a more formal tone, mention invoice #1234…"
                  rows={3}
                />
                <Button
                  variant="secondary"
                  onClick={() => void refineDraft()}
                  disabled={isRefining || !refineInstructions.trim()}
                  loading={isRefining}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isRefining ? "Refining…" : "Refine Draft"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Context sources */}
          {draft && draft.sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted" />
                  Context Used
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {draft.sources.map((s) => (
                    <li
                      key={s.docId}
                      className="text-xs border border-border-light rounded-lg p-3 bg-surface-secondary"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800 truncate">
                          {s.filename}
                        </span>
                        <span className="text-muted-foreground ml-2 shrink-0">
                          {fmtDate(s.sourceDate)}
                        </span>
                      </div>
                      <p className="text-muted italic line-clamp-2">{s.excerpt}…</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right column: draft output ── */}
        <div className="flex flex-col">
          {error && (
            <FlashMessage
              variant="error"
              message={error}
              className="mb-4"
              onDismiss={() => setError(null)}
            />
          )}

          {draft ? (
            <Card className="flex flex-col flex-1">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted" />
                  Your Draft
                </CardTitle>
                <div className="flex items-center gap-3">
                  {draft.metadata && (
                    <span className="text-xs text-muted-foreground">
                      ₹{draft.metadata.costEstimateInr.toFixed(4)} ·{" "}
                      {draft.metadata.latencyMs}ms
                    </span>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void copyToClipboard()}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 space-y-4">
                {/* Gmail save success banner */}
                {gmailResult && (
                  <FlashMessage
                    variant="success"
                    message={`Draft saved to Gmail! (ID: ${gmailResult.gmailDraftId})`}
                  />
                )}

                {/* Recipient + Save to Gmail */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label="Recipient Email"
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => {
                        setRecipientEmail(e.target.value);
                        setGmailResult(null);
                      }}
                      placeholder="client@example.com"
                    />
                  </div>
                  <Button
                    variant="success"
                    onClick={() => void sendToGmail()}
                    disabled={isSending || !recipientEmail.trim() || !draftText.trim()}
                    loading={isSending}
                    className="whitespace-nowrap"
                  >
                    <Mail className="h-4 w-4" />
                    {isSending ? "Saving…" : "Save to Gmail"}
                  </Button>
                </div>

                {/* Subject line */}
                <Input
                  label="Subject"
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  placeholder="Subject line…"
                />

                {/* Body */}
                <div className="flex-1 flex flex-col">
                  <Textarea
                    label="Body"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    className="flex-1 min-h-[320px]"
                    placeholder="Draft body will appear here…"
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed flex-1 min-h-[300px] flex items-center justify-center bg-surface-secondary">
              <EmptyState
                icon={<PenLine className="h-6 w-6" />}
                title="No draft yet"
                description="Enter your instructions on the left and click Generate Draft to create a professional email."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
