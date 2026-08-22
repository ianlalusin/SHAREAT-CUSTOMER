"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/games/recipe/types";

const CHOICES: { verdict: Verdict; emoji: string; label: string; ring: string }[] = [
  { verdict: "yuck", emoji: "🤢", label: "Yuck", ring: "hover:border-rose-400 focus-visible:ring-rose-400" },
  { verdict: "good", emoji: "🙂", label: "Good", ring: "hover:border-amber-400 focus-visible:ring-amber-400" },
  { verdict: "yummy", emoji: "🤤", label: "Yummy", ring: "hover:border-emerald-500 focus-visible:ring-emerald-500" },
];

/** Why the buttons are unavailable, in the diner's words. */
const REASONS: Record<string, string> = {
  no_session: "Join your table to rate this.",
  own: "This is yours — let others be the judge.",
  same_table: "Someone at your table made this. Let others try it.",
  voted: "You already rated this one.",
};

export function VerdictButtons({
  canVote,
  reason,
  onVote,
}: {
  canVote: boolean;
  reason: string | null;
  onVote: (verdict: Verdict) => Promise<void>;
}) {
  const [busy, setBusy] = useState<Verdict | null>(null);
  /**
   * A verdict means "I tried this", so it has to cost one deliberate tap to
   * open. Without the gate the board fills with ratings from people who only
   * scrolled past, and a "Yummy" stops meaning anything.
   */
  const [armed, setArmed] = useState(false);

  if (!canVote) {
    return (
      <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-center text-sm text-muted-foreground">
        {(reason && REASONS[reason]) || "Rating is not available."}
      </p>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-base shadow-md hover:scale-[1.01] active:scale-[0.98] transition-all"
      >
        I tried this — let me rate it
      </button>
    );
  }

  return (
    <div>
      <p className="text-center text-sm font-bold mb-2">How was it?</p>
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.verdict}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(c.verdict);
              try {
                await onVote(c.verdict);
              } finally {
                setBusy(null);
              }
            }}
            className={cn(
              "h-24 rounded-2xl border-2 bg-white flex flex-col items-center justify-center gap-1",
              "active:scale-[0.97] transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2",
              c.ring
            )}
          >
            {busy === c.verdict ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <span className="text-3xl leading-none" aria-hidden>{c.emoji}</span>
            )}
            <span className="text-sm font-bold">{c.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">You can only rate a recipe once.</p>
    </div>
  );
}
