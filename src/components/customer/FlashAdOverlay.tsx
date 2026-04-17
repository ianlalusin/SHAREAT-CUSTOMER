"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type FlashAdItem = {
  imageUrl: string;
  clickBehavior: "close" | "redirect";
  redirectUrl?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  ads: FlashAdItem[];
}

type StoryState = { index: number; progress: number };

export function FlashAdOverlay({ open, onClose, ads }: Props) {
  const [mounted, setMounted] = useState(false);
  const [story, setStory] = useState<StoryState>({ index: 0, progress: 0 });
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const indexRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const durationMs = ads.length > 1 ? 10000 : 15000;
  const adsCount = ads.length;

  useEffect(() => { setMounted(true); }, []);

  // Reset when opening
  useEffect(() => {
    if (open) {
      indexRef.current = 0;
      startRef.current = 0;
      setStory({ index: 0, progress: 0 });
    }
  }, [open]);

  // Single animation loop — updates index + progress in one setState
  useEffect(() => {
    if (!open || adsCount === 0) return;

    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startRef.current;
      const pct = Math.min(elapsed / durationMs, 1);

      if (pct >= 1) {
        const next = indexRef.current + 1;
        if (next >= adsCount) {
          setStory({ index: indexRef.current, progress: 1 });
          setTimeout(() => onCloseRef.current(), 0);
          return;
        }
        indexRef.current = next;
        startRef.current = now;
        // Immediately render the new ad at progress 0
        setStory({ index: next, progress: 0 });
      } else {
        setStory({ index: indexRef.current, progress: pct });
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open, adsCount, durationMs]);

  const handleClose = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    onClose();
  }, [onClose]);

  if (!open || !mounted || typeof document === "undefined" || ads.length === 0) return null;

  const ad = ads[story.index] || ads[0];

  function handleImageClick() {
    if (ad.clickBehavior === "redirect" && ad.redirectUrl) {
      let url = ad.redirectUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      // Only allow http/https schemes
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch {}
    }
    handleClose();
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
      onClick={handleClose}
    >
      <div
        className="relative max-w-lg w-full animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Story progress bars */}
        <div className="absolute -top-6 left-0 right-0 flex gap-1 px-1">
          {ads.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width:
                    i < story.index
                      ? "100%"
                      : i === story.index
                        ? `${story.progress * 100}%`
                        : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -top-3 -right-3 z-10 h-9 w-9 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-zinc-100 transition"
          aria-label="Close ad"
        >
          <X className="h-5 w-5 text-zinc-700" />
        </button>

        {/* Ad image */}
        <img
          src={ad.imageUrl}
          alt="Promotional ad"
          className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl cursor-pointer"
          onClick={handleImageClick}
          draggable={false}
        />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
