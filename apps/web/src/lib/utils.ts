import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with clsx — handles conflicts correctly. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format date in Indian locale (e.g. "05 Jun 2025") */
export function fmtDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format date-time in Indian locale (e.g. "05 Jun 2025, 14:30") */
export function fmtDateTime(date: string | Date) {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format ms to human-readable (e.g. "1.2s") */
export function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Generate a simple unique ID */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
