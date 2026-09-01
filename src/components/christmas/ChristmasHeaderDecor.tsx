"use client";

import { usePathname } from "next/navigation";
import { isCustomerFacingRoute } from "@/lib/christmas-countdown";
import { ParolStar } from "./ParolStar";
import { GarlandStrip } from "./GarlandStrip";

/**
 * Thin festive ribbon rendered in normal document flow at the very top of
 * customer-facing pages — sits above any page's own sticky header instead of
 * overlapping it. Hidden on /admin and /manager (internal staff tools).
 */
export function ChristmasHeaderDecor() {
  const pathname = usePathname();
  if (!isCustomerFacingRoute(pathname ?? "/")) return null;

  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-2 bg-pine-deep py-1.5">
      <ParolStar className="h-7 w-6" />
      <GarlandStrip count={9} />
    </div>
  );
}
