import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors",
            error && "border-red-300 focus:ring-red-500/30 focus:border-red-500",
            className,
          )}
          {...props}
        />
        {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
