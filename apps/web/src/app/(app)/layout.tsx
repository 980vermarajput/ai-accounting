"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../contexts/user-context";
import { AppNav } from "../../components/app-nav";

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
      <div className="flex h-screen items-center justify-center gap-3">
        <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Loading…</span>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AppNav />
      <main className="ml-56 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
