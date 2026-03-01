import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ─── Variants ────────────────────────────────────────────────────── */

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800",
  secondary:
    "bg-white text-gray-700 border border-border hover:bg-surface-tertiary active:bg-gray-100",
  ghost: "text-gray-600 hover:bg-surface-tertiary hover:text-gray-900",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  "danger-outline":
    "text-red-600 border border-red-200 hover:bg-red-50 active:bg-red-100",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  link: "text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline p-0 h-auto",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4",
  lg: "h-10 px-5",
  icon: "h-9 w-9",
} as const;

/* ─── Component ───────────────────────────────────────────────────── */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  ),
);

Button.displayName = "Button";
