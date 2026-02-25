"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const REASON_MESSAGES: Record<string, string> = {
  access_denied: "You denied access on the Google consent screen.",
  missing_code: "The authorization code was missing from the callback.",
  no_token: "No authentication token was returned.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "unknown";
  const message =
    REASON_MESSAGES[reason] ?? "An unexpected error occurred during sign in.";

  return (
    <div className="text-center space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 text-2xl flex items-center justify-center mx-auto">
        ✕
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sign in failed</h1>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <p className="mt-1 text-xs text-gray-400">Error code: {reason}</p>
      </div>
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
      >
        Try again
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Suspense
        fallback={
          <p className="text-sm text-gray-400">Loading error details…</p>
        }
      >
        <ErrorContent />
      </Suspense>
    </main>
  );
}
