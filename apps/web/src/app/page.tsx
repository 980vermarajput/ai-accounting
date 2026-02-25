"use client";

import { useEffect, useState } from "react";

interface HealthData {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/health`,
    )
      .then((res) => res.json() as Promise<{ data: HealthData }>)
      .then((data) => setHealth(data.data))
      .catch(() => setError("API not reachable"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        {/* Logo / Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white text-2xl font-bold">
            AI
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            AI Assistant for Accountants
          </h1>
          <p className="text-lg text-gray-500">
            Search your emails, documents & spreadsheets — get instant,
            citation-backed answers.
          </p>
        </div>

        {/* API Status Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
            System Status
          </h2>
          {error ? (
            <div className="flex items-center justify-center gap-2 text-red-600">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>{error}</span>
            </div>
          ) : health ? (
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                API is {health.status}
              </div>
              <p className="text-gray-400">
                {health.service} v{health.version}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 animate-pulse">
              Checking API connection…
            </p>
          )}
        </div>

        {/* Quick info */}
        <p className="text-xs text-gray-400">
          Next.js 14 • Express.js • PostgreSQL + pgvector • Redis • OpenAI
        </p>
      </div>
    </main>
  );
}
