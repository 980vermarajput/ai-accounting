import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-6 w-6 border-[3px]",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-gray-300 border-t-primary-600",
        sizeMap[size],
        className,
      )}
    />
  );
}
