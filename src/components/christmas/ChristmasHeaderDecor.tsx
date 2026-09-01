"use client";

import { usePathname } from "next/navigation";
import { isCustomerFacingRoute } from "@/lib/christmas-countdown";

// Capiz-star parol — 5-point star only, gold gradient, no red anywhere.
// (An earlier draft used a 🏮 lantern emoji here, which reads as a red
// Chinese/Japanese paper lantern rather than a Filipino star parol — removed.)
function ParolStar() {
  return (
    <svg viewBox="0 0 100 116" width="20" height="23" aria-hidden="true">
      <defs>
        <radialGradient id="parolStarGrad" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#FFF6DC" />
          <stop offset="55%" stopColor="hsl(var(--gold-light))" />
          <stop offset="100%" stopColor="hsl(var(--gold-deep))" />
        </radialGradient>
      </defs>
      <polygon
        points="50,10 60,36.25 88.04,37.64 66.17,55.25 73.51,82.36 50,67 26.49,82.36 33.83,55.25 11.96,37.64 40,36.25"
        fill="url(#parolStarGrad)"
        stroke="hsl(var(--gold-deep))"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GARLAND_COLORS = ["hsl(var(--accent))", "hsl(var(--primary))", "hsl(var(--pine))", "hsl(var(--gold-light))"];

function GarlandBulb({ index }: { index: number }) {
  return (
    <span
      className="christmas-twinkle inline-block h-[7px] w-[7px] rounded-full"
      style={{
        background: GARLAND_COLORS[index % GARLAND_COLORS.length],
        animation: "christmas-twinkle 2.2s ease-in-out infinite",
        animationDelay: `${index * 0.22}s`,
        boxShadow: `0 0 4px ${GARLAND_COLORS[index % GARLAND_COLORS.length]}`,
      }}
    />
  );
}

/**
 * Thin festive ribbon rendered in normal document flow at the very top of
 * customer-facing pages — sits above any page's own sticky header instead of
 * overlapping it. Hidden on /admin and /manager (internal staff tools).
 */
export function ChristmasHeaderDecor() {
  const pathname = usePathname();
  if (!isCustomerFacingRoute(pathname ?? "/")) return null;

  const bulbs = Array.from({ length: 9 }, (_, i) => i);

  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-2 bg-pine-deep py-1.5"
    >
      <ParolStar />
      <div className="flex items-center gap-3">
        {bulbs.map((i) => (
          <GarlandBulb key={i} index={i} />
        ))}
      </div>
    </div>
  );
}
