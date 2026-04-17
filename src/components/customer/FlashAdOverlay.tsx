"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  clickBehavior: "close" | "redirect";
  redirectUrl?: string | null;
}

export function FlashAdOverlay({ open, onClose, imageUrl, clickBehavior, redirectUrl }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose(), 15000);
    return () => clearTimeout(t);
  }, [open, onClose]);

  if (!open || !mounted || typeof document === "undefined") return null;

  function handleImageClick() {
    if (clickBehavior === "redirect" && redirectUrl) {
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
    }
    onClose();
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 h-9 w-9 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-zinc-100 transition"
          aria-label="Close ad"
        >
          <X className="h-5 w-5 text-zinc-700" />
        </button>

        {/* Ad image */}
        <img
          src={imageUrl}
          alt="Promotional ad"
          className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl cursor-pointer"
          onClick={handleImageClick}
          draggable={false}
        />

        {/* Countdown bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl overflow-hidden bg-black/20">
          <div
            className="h-full bg-white/80 rounded-b-2xl"
            style={{
              animation: "flashAdCountdown 15s linear forwards",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes flashAdCountdown {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
