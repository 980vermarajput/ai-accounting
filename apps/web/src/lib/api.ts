/**
 * Typed API fetch wrapper for the @ai-accounting/api server.
 *
 * - Reads the JWT from localStorage on every request.
 * - Throws an Error with the API's error message on non-2xx responses.
 * - Safe to import in both server and client components (guards on window).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Token helpers ───────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("jwt");
}

export function setToken(token: string): void {
  localStorage.setItem("jwt", token);
}

export function clearToken(): void {
  localStorage.removeItem("jwt");
}

// ─── Fetch wrapper ───────────────────────────────────────────────

type FetchOptions = RequestInit & {
  /** Skip Authorization header (e.g. for the sign-in redirect). */
  skipAuth?: boolean;
};

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth = false, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      /* ignore parse error */
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
