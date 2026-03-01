import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";

type Variant = "success" | "error" | "warning" | "info";

const variantStyles: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

const variantIcons: Record<Variant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  error: <XCircle className="h-4 w-4 shrink-0" />,
  warning: <AlertCircle className="h-4 w-4 shrink-0" />,
  info: <Info className="h-4 w-4 shrink-0" />,
};

interface FlashMessageProps {
  variant: Variant;
  message: string;
  className?: string;
  onDismiss?: () => void;
}

export function FlashMessage({
  variant,
  message,
  className,
  onDismiss,
}: FlashMessageProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
        variantStyles[variant],
        className,
      )}
    >
      {variantIcons[variant]}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}
