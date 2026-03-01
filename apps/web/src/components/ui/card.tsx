import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/* ─── Card ────────────────────────────────────────────────────────── */

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border border-border bg-white shadow-card", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/* ─── CardHeader ──────────────────────────────────────────────────── */

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("border-b border-border-light px-5 py-4", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

/* ─── CardTitle ───────────────────────────────────────────────────── */

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-sm font-semibold text-gray-900", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

/* ─── CardDescription ─────────────────────────────────────────────── */

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("mt-0.5 text-xs text-muted", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

/* ─── CardContent ─────────────────────────────────────────────────── */

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";
