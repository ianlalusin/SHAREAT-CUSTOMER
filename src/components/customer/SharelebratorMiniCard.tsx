"use client";

import { Star } from "lucide-react";

interface Props {
  onClick?: () => void;
}

export function SharelebratorMiniCard({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-[5rem] right-5 z-50 h-14 w-40 rounded-lg overflow-hidden shadow-lg border border-zinc-700 hover:scale-[1.03] active:scale-[0.97] transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
      style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #3a3a3a 50%, #1a1a1a 60%, #0a0a0a 100%)",
      }}
      aria-label="View Sharelebrator Card"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 bottom-0 w-[30%] -skew-x-12"
          style={{
            left: "-30%",
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
            animation: "sharelebratorShine 3.5s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes sharelebratorShine {
          0% { left: -30%; }
          60%, 100% { left: 130%; }
        }
      `}</style>
      <div className="relative h-full w-full flex items-center gap-2 px-3">
        <Star className="h-5 w-5 text-white drop-shadow flex-shrink-0" strokeWidth={2.5} fill="currentColor" />
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] font-bold text-white/90 tracking-wider uppercase">Sharelebrator</span>
          <span className="text-xs font-black text-white tracking-wide">Card</span>
        </div>
      </div>
    </button>
  );
}
