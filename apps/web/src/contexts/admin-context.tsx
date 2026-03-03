"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiFetch, clearToken } from "../lib/api";
import type { ApiResponse } from "@ai-accounting/shared";

// ─── Types ────────────────────────────────────────────────────

/** Platform admin user shape */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  isAdmin: boolean;
  firm: {
    id: string;
    name: string;
    slug: string;
  };
}

interface AdminContextValue {
  adminUser: AdminUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────

export function AdminProvider({ children }: { children: ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAdminUser = useCallback(async () => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    try {
      // First check if user is authenticated
      const userRes = await apiFetch<ApiResponse<{
        id: string;
        email: string;
        name: string;
        role: "admin" | "member";
        isAdmin?: boolean;
        firm: { id: string; name: string; slug: string; };
      }>>("/api/auth/me");

      if (userRes.data?.isAdmin === true) {
        // User is a platform admin
        setAdminUser({
          id: userRes.data.id,
          email: userRes.data.email,
          name: userRes.data.name,
          role: userRes.data.role,
          isAdmin: true,
          firm: userRes.data.firm,
        });
      } else {
        // User exists but not a platform admin
        setAdminUser(null);
      }
    } catch (error) {
      // Not authenticated or other error
      clearToken();
      setAdminUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdminUser();
  }, [fetchAdminUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — still clear token locally */
    }
    clearToken();
    setAdminUser(null);
    window.location.href = "/sign-in";
  }, []);

  return (
    <AdminContext.Provider
      value={{ adminUser, isLoading, logout, refresh: fetchAdminUser }}
    >
      {children}
    </AdminContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useAdminUser(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminUser must be used within <AdminProvider>");
  return ctx;
}