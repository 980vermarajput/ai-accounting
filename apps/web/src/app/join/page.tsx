"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface InvitePreview {
  firmName: string;
  inviterName: string;
  role: "admin" | "member";
  expiresAt: string;
  email?: string | null;
}

export default function JoinPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No invite token found in the URL.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/team/invites/preview/${token}`);
        const json = (await res.json()) as {
          success: boolean;
          data?: InvitePreview;
          error?: { message: string };
        };

        if (!res.ok || !json.success) {
          const msg = json.error?.message ?? "This invite is invalid or has expired.";
          // Map specific error codes to user-friendly messages
          if (res.status === 410)
            setError("This invite link has already been used or has expired.");
          else if (res.status === 404) setError("This invite link is invalid.");
          else setError(msg);
          return;
        }

        setPreview(json.data!);
      } catch {
        setError("Could not load invite details. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const expiryDate = preview
    ? new Date(preview.expiresAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-surface-secondary">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 text-white text-sm font-bold flex items-center justify-center shadow-card">
            CA
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI for Accountants</h1>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-2xl border border-border shadow-card p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner size="md" />
              <p className="text-sm text-muted">Loading invite…</p>
            </div>
          ) : error ? (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <svg
                  className="w-6 h-6 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">Invite Unavailable</p>
              <p className="text-sm text-muted">{error}</p>
              <a
                href="/sign-in"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Sign in instead →
              </a>
            </div>
          ) : preview ? (
            <>
              <div className="text-center space-y-1">
                <p className="text-xs font-medium text-muted uppercase tracking-wide">
                  You&apos;ve been invited
                </p>
                <p className="text-lg font-semibold text-gray-900">{preview.firmName}</p>
                <p className="text-sm text-muted">
                  {preview.inviterName} invited you to join as{" "}
                  <span className="font-medium text-gray-700 capitalize">
                    {preview.role}
                  </span>
                </p>
              </div>

              {preview.email && (
                <div className="rounded-lg bg-primary-50 border border-primary-100 px-4 py-3">
                  <p className="text-xs text-primary-700">
                    This invite is for{" "}
                    <span className="font-semibold">{preview.email}</span>. Make sure to
                    sign in with that Google account.
                  </p>
                </div>
              )}

              <div className="border-t border-border-light pt-4 space-y-3">
                <a
                  href={`${API_BASE}/api/auth/google?invite=${token ?? ""}`}
                  className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg border border-border bg-surface text-sm font-medium text-gray-700 hover:bg-surface-tertiary active:bg-surface-secondary transition-colors shadow-sm"
                >
                  {/* Google logo */}
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                      fill="#4285F4"
                    />
                    <path
                      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                      fill="#34A853"
                    />
                    <path
                      d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                      fill="#EA4335"
                    />
                  </svg>
                  Accept &amp; Sign in with Google
                </a>

                <p className="text-xs text-muted text-center">
                  Invite expires on {expiryDate}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
