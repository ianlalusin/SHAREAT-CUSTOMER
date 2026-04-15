"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  durationMs?: number;
}

/**
 * Modern centered alert — appears over the screen with an overlay,
 * warning icon, and auto-dismisses. Use for blocking validation
 * issues that the cashier-side toast feels too quiet for.
 */
export function CenterAlert({ open, onClose, title, message, durationMs = 3500 }: Props) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose(), durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
      onClick={onClose}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border-l-[6px] border-amber-500 p-5 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-zinc-100 transition"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-zinc-400" />
        </button>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-600" strokeWidth={2.5} />
          </div>
          <div className="flex-1 pt-0.5">
            <p className="text-sm font-bold text-zinc-900">{title}</p>
            <p className="text-sm text-zinc-600 mt-0.5 leading-snug">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
