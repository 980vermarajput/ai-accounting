import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, id, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div>
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "flex w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none transition-colors",
            className,
          )}
          {...props}
        />
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
