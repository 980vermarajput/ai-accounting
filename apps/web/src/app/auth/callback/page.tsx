"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "../../../lib/api";
import { useUser } from "../../../contexts/user-context";
import { Spinner } from "@/components/ui";

/**
 * Handles the OAuth callback redirect.
 *
 * The backend already sets the `__session` HttpOnly cookie before redirecting
 * here, so the cookie is available immediately. We also store the token in
 * localStorage as a fallback for the Authorization header.
 *
 * Then we call refresh() to re-fetch /api/auth/me (which now works via cookie)
 * so the UserProvider context has a valid user before we navigate to /chat.
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
      // Store in localStorage as Bearer header fallback
      setToken(token);
    }

    // Cookie is already set by the backend redirect — refresh context
    // to pick up the user session, then navigate.
    refresh().then(() => {
      router.replace("/chat");
    });
  }, [router, searchParams, refresh]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <div className="flex h-screen items-center justify-center gap-3 bg-surface-secondary">
      <Spinner size="sm" />
      <span className="text-sm text-muted">Completing sign in…</span>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
