"use client";

import { type ReactNode, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Max width class — defaults to "max-w-md" */
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  children,
  className,
  maxWidth = "max-w-md",
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          "relative w-full rounded-xl bg-white shadow-modal",
          maxWidth,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Modal sub-components ────────────────────────────────────────── */

export function ModalHeader({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border-light px-5 py-4",
        className,
      )}
    >
      <div className="text-base font-semibold text-gray-900">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-surface-tertiary hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ModalBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function ModalFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 border-t border-border-light px-5 py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
