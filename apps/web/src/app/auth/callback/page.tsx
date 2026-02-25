"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "../../../lib/api";

/**
 * Reads `?token=` from the URL, stores in localStorage, then redirects.
 * Wrapped in <Suspense> as required by Next.js when using useSearchParams.
 */
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");
    if (token) {
      setToken(token);
      router.replace("/chat");
    } else {
      router.replace("/auth/error?reason=no_token");
    }
  }, [router, searchParams]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <div className="flex h-screen items-center justify-center gap-3">
      <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
      <span className="text-sm text-gray-500">Completing sign in…</span>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
