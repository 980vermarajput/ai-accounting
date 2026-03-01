"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../contexts/user-context";
import { AppNav } from "../../components/app-nav";
import { Spinner } from "@/components/ui";

/** Wraps all /chat and /documents routes. Redirects to sign-in if unauthenticated. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/sign-in");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 bg-surface-secondary">
        <Spinner size="md" />
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 overflow-hidden">
      <AppNav />
      <main className="ml-64 flex-1 overflow-y-auto custom-scrollbar">{children}</main>
    </div>
  );
}
