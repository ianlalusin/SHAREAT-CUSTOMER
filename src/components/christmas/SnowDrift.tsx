"use client";

import { usePathname } from "next/navigation";
import { isCustomerFacingRoute } from "@/lib/christmas-countdown";

const FLAKES = Array.from({ length: 12 }, (_, i) => ({
  left: `${(i * 8.3 + (i % 3) * 5) % 100}%`,
  size: 3 + (i % 4),
  duration: 9 + (i % 5) * 2,
  delay: i * 0.9,
}));

/**
 * Ambient, non-interactive falling-snow overlay. CSS-only animation, very
 * low density, fixed below any modal/toast z-index so it never blocks taps.
 */
export function SnowDrift() {
  const pathname = usePathname();
  if (!isCustomerFacingRoute(pathname ?? "/")) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
    >
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="christmas-snow-drop absolute top-0 rounded-full bg-[#FFF3D6] opacity-80"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            animation: `christmas-snow-fall ${f.duration}s linear infinite`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
