"use client";

import { useEffect, useState } from "react";

const EMOJIS = ["\u{1F60A}", "\u{1F929}", "\u{1F62E}", "\u{1F92D}"];

interface Props {
  onClick: () => void;
}

export function FlashAdBadge({ onClick }: Props) {
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [entered, setEntered] = useState(false);

  // Cycle through emojis
  useEffect(() => {
    const interval = setInterval(() => {
      setEmojiIndex((i) => (i + 1) % EMOJIS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Trigger entrance animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <>
      <style>{`
        @keyframes flashAdPop {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes flashAdWiggle {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.08) rotate(-4deg); }
          50% { transform: scale(1) rotate(0deg); }
          75% { transform: scale(1.08) rotate(4deg); }
        }
        @keyframes flashAdEmojiSwap {
          0% { transform: scale(0.3); opacity: 0; }
          8% { transform: scale(1.15); opacity: 1; }
          15%, 100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <button
        onClick={onClick}
        className="fixed bottom-[9rem] right-5 z-50 h-12 w-12 rounded-full bg-white shadow-xl border border-zinc-200 flex items-center justify-center hover:shadow-2xl active:scale-90 transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        style={{
          animation: entered
            ? "flashAdPop 0.4s ease-out forwards, flashAdWiggle 2.5s ease-in-out 0.5s infinite"
            : "none",
        }}
        aria-label="View promotional ad"
      >
        <span
          className="text-2xl leading-none select-none pointer-events-none"
          style={{ animation: "flashAdEmojiSwap 0.4s ease-out" }}
          key={emojiIndex}
        >
          {EMOJIS[emojiIndex]}
        </span>
      </button>
    </>
  );
}
