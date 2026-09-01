"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getChristmasCountdown, isCustomerFacingRoute, type ChristmasCountdown } from "@/lib/christmas-countdown";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function OrnamentBadge({ value, label, from, to }: { value: string; label: string; from: string; to: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full font-bold text-lg text-white shadow-inner"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${from}, ${to})`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</label>
    </div>
  );
}

/**
 * Footer countdown band — appears at the bottom of every customer-facing
 * screen (mounted once in the root layout, after {children}). Hidden on
 * /admin and /manager.
 */
export function ChristmasFooterCountdown() {
  const pathname = usePathname();
  const [cd, setCd] = useState<ChristmasCountdown | null>(null);

  useEffect(() => {
    setCd(getChristmasCountdown());
    const id = setInterval(() => setCd(getChristmasCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!isCustomerFacingRoute(pathname ?? "/") || !cd) return null;

  return (
    <div
      className="mt-6 bg-gradient-to-b from-pine-deep to-pine px-4 py-6 text-center"
      role="region"
      aria-label="Countdown to Christmas Sharelebration"
    >
      <div className="font-bold text-white">🎄 Countdown to Christmas Sharelebration</div>
      <div className="mb-4 mt-0.5 text-xs text-white/70" aria-live="polite">
        {cd.isPast ? "Maligayang Pasko! 🎉" : `${cd.days} days until Noche Buena`}
      </div>
      <div className="flex justify-center gap-3">
        <OrnamentBadge value={String(cd.days)} label="Days" from="#FFE199" to="hsl(var(--gold-deep))" />
        <OrnamentBadge value={pad(cd.hours)} label="Hrs" from="#FF8A8A" to="hsl(var(--primary))" />
        <OrnamentBadge value={pad(cd.minutes)} label="Min" from="#5FD6A0" to="hsl(var(--pine))" />
        <OrnamentBadge value={pad(cd.seconds)} label="Sec" from="#FFE199" to="#A50606" />
      </div>
    </div>
  );
}
