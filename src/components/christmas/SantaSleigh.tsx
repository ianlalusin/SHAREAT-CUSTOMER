"use client";

import { usePathname } from "next/navigation";
import { isCustomerFacingRoute } from "@/lib/christmas-countdown";

/**
 * A silhouette of Santa's sleigh, pulled by three reindeer, gliding left to
 * right across the top of the screen every so often. Purely decorative
 * (aria-hidden), fixed + pointer-events-none so it never sits above real UI
 * or blocks taps. Reindeer lead on the right side of the composition so they
 * visually pull the sleigh in the direction of travel.
 */
export function SantaSleigh() {
  const pathname = usePathname();
  if (!isCustomerFacingRoute(pathname ?? "/")) return null;

  return (
    <div className="santa-sleigh-track" aria-hidden="true">
      <div className="santa-sleigh-bob">
        <svg viewBox="0 0 600 140" className="santa-sleigh-scene">
          {/* sparkle trail */}
          <g className="santa-sleigh-sparkle" fill="hsl(var(--gold-light))">
            <circle cx="8" cy="118" r="2.4" />
            <circle cx="20" cy="108" r="1.8" />
            <circle cx="32" cy="122" r="2" />
          </g>

          {/* sleigh */}
          <g fill="#5C3A21">
            <path d="M40 118 C40 100 55 88 78 88 L200 88 C214 88 224 96 224 108 L224 122 C224 130 218 136 208 136 L58 136 C48 136 40 128 40 118 Z" />
            <path d="M40 118 C30 118 20 112 18 100 C17 94 21 90 26 92 C24 100 30 108 40 110 Z" />
          </g>
          {/* gift sack */}
          <g fill="hsl(var(--gold-deep))">
            <ellipse cx="205" cy="86" rx="20" ry="16" />
            <circle cx="192" cy="76" r="7" />
          </g>
          {/* Santa */}
          <g>
            <ellipse cx="150" cy="82" rx="26" ry="22" fill="hsl(var(--primary))" />
            <circle cx="150" cy="52" r="14" fill="#F2B78C" />
            <path d="M136 46c4-14 24-14 28 0-8-3-20-3-28 0Z" fill="hsl(var(--primary))" />
            <circle cx="166" cy="42" r="5" fill="#fff" />
            <rect x="134" y="44" width="32" height="6" rx="3" fill="#fff" />
          </g>

          {/* harness lines */}
          <g stroke="#5C3A21" strokeWidth="2" fill="none" opacity="0.8">
            <path d="M224 108 L300 104" />
            <path d="M300 104 L380 100" />
            <path d="M380 100 L460 96" />
          </g>

          {/* reindeer x3 */}
          {[300, 400, 500].map((x, i) => (
            <g key={x} transform={`translate(${x} 0)`} fill="#8B5A2B">
              <g stroke="#8B5A2B" strokeWidth="2.6" strokeLinecap="round" fill="none">
                <path d="M28 30 20 10 M20 10 13 14 M20 10 15 21" />
                <path d="M46 30 54 10 M54 10 61 14 M54 10 56 21" />
              </g>
              <path d="M4 92c0-10 8-18 20-18h40c14 0 24 10 24 22 0 8-6 14-14 14H20c-9 0-16-8-16-18Z" />
              <path d="M64 78c8-2 16 0 20 6 3 5 1 10-4 11-3-6-9-11-16-13Z" />
              <ellipse cx="38" cy="76" rx="7" ry="5" fill="#E9D9C4" />
              <circle cx="30" cy="68" r="2.6" fill="#2A2118" />
              <line x1="16" y1="104" x2="10" y2="126" strokeWidth="5" stroke="#8B5A2B" strokeLinecap="round" />
              <line x1="30" y1="106" x2="26" y2="128" strokeWidth="5" stroke="#8B5A2B" strokeLinecap="round" />
              <line x1="46" y1="106" x2="50" y2="128" strokeWidth="5" stroke="#8B5A2B" strokeLinecap="round" />
              <line x1="58" y1="104" x2="64" y2="126" strokeWidth="5" stroke="#8B5A2B" strokeLinecap="round" />
              {i === 2 ? <circle cx="38" cy="80" r="3.5" fill="hsl(var(--primary))" /> : null}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
