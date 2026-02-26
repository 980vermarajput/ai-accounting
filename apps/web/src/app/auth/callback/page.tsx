"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "../../../lib/api";
import { useUser } from "../../../contexts/user-context";

/**
 * Reads `?token=` from the URL, stores in localStorage, then refreshes the
 * UserProvider context before redirecting. Without the refresh() call, the
 * context already finished loading with user=null (token wasn't set yet), and
 * AppLayout would immediately bounce back to /sign-in.
 */
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useUser();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");
    if (token) {
      setToken(token);
      // Re-fetch /api/auth/me with the new token so the context has a valid
      // user before we navigate — prevents the "sign in twice" race condition.
      refresh().then(() => {
        router.replace("/chat");
      });
    } else {
      router.replace("/auth/error?reason=no_token");
    }
  }, [router, searchParams, refresh]);

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
