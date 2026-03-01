"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

const REASON_MESSAGES: Record<string, string> = {
  access_denied: "You denied access on the Google consent screen.",
  missing_code: "The authorization code was missing from the callback.",
  no_token: "No authentication token was returned.",
  invite_invalid: "This invite link is invalid or has already been used.",
  invite_expired: "This invite link has expired. Ask an admin to send a new one.",
  invite_email_mismatch:
    "This invite was sent to a different email address. Please sign in with the correct Google account.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "unknown";
  const message =
    REASON_MESSAGES[reason] ?? "An unexpected error occurred during sign in.";

  return (
    <div className="text-center space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sign in failed</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">Error code: {reason}</p>
      </div>
      <Link href="/sign-in">
        <Button>Try again</Button>
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 bg-surface-secondary">
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading error details…</p>}
      >
        <ErrorContent />
      </Suspense>
    </main>
  );
}
