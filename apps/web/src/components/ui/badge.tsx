import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/* ─── Variants ────────────────────────────────────────────────────── */

const variants = {
  default: "bg-gray-100 text-gray-700",
  primary: "bg-primary-50 text-primary-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
  processing: "bg-blue-50 text-blue-700",
  outline: "border border-border text-gray-600 bg-transparent",
} as const;

/* ─── Component ───────────────────────────────────────────────────── */

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  ),
);

Badge.displayName = "Badge";

/* ─── StatusBadge (domain-specific convenience) ───────────────────── */

const STATUS_VARIANT: Record<string, keyof typeof variants> = {
  pending: "default",
  processing: "processing",
  ready: "success",
  error: "danger",
  active: "success",
  completed: "success",
  cancelled: "default",
  failed: "danger",
  syncing: "info",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const variant = STATUS_VARIANT[status] ?? "default";
  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
}
