"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiFetch, getToken, clearToken } from "../lib/api";
import type { ApiResponse } from "@ai-accounting/shared";

// ─── Types ────────────────────────────────────────────────────────

/** Shape returned by GET /api/auth/me */
export interface UserWithFirm {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  lastSyncAt: string | null;
  firm: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

interface UserContextValue {
  user: UserWithFirm | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserWithFirm | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    if (!getToken()) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiFetch<ApiResponse<UserWithFirm>>("/api/auth/me");
      setUser(res.data ?? null);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — still clear token locally */
    }
    clearToken();
    setUser(null);
    window.location.href = "/sign-in";
  }, []);

  return (
    <UserContext.Provider
      value={{ user, isLoading, logout, refresh: fetchUser }}
    >
      {children}
    </UserContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within <UserProvider>");
  return ctx;
}
