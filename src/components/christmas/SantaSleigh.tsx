"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isCustomerFacingRoute } from "@/lib/christmas-countdown";
import { SLEIGH_TEAM_URL } from "@/components/games/ghost-hunt/packs";
import { flightPose, randomFlight } from "@/components/games/ghost-hunt/flights";

/** Seconds between passes, and how long one pass takes. Decoration, so slower than the game's fly-bys. */
const GAP_MS: [number, number] = [25_000, 50_000];
const PASS_SLOWDOWN = 3;
const WIDTH = 230;

/**
 * Santa's sleigh, pulled by Rudolf, crossing the screen every so often — each
 * pass on a random path (straight, diagonal, wave, loop-the-loop, boomerang,
 * zigzag) from a random side. Same art and flight paths as the Spot a Ghost
 * Christmas fly-by, so the two stay one picture.
 *
 * Purely decorative (aria-hidden), fixed and pointer-events-none so it never
 * sits above real UI or blocks taps. Kept in the top part of the screen, where
 * it crosses headers rather than the buttons diners are reaching for.
 */
export function SantaSleigh() {
  const pathname = usePathname();
  const show = isCustomerFacingRoute(pathname ?? "/");
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!show) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let timer: number | undefined;

    const pass = () => {
      const box = boxRef.current;
      const img = imgRef.current;
      if (!box || !img) return;
      const flight = randomFlight();
      const ms = flight.ms * PASS_SLOWDOWN;
      const h = box.offsetHeight || 110;
      const start = performance.now();
      box.style.visibility = "visible";

      const tick = (now: number) => {
        const p = (now - start) / ms;
        if (p >= 1) {
          box.style.visibility = "hidden";
          timer = window.setTimeout(pass, GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]));
          return;
        }
        // Fly within the top 55% of the screen.
        const pose = flightPose(flight, p, window.innerWidth, window.innerHeight * 0.55, WIDTH);
        box.style.transform = `translate(${pose.x - WIDTH / 2}px, ${pose.y - h / 2}px) rotate(${pose.tilt}deg)`;
        img.style.transform = pose.facingLeft ? "scaleX(-1)" : "";
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    timer = window.setTimeout(pass, 4000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="santa-sleigh-track" aria-hidden="true">
      <div ref={boxRef} className="santa-sleigh-bob" style={{ visibility: "hidden" }}>
        {/* Wrapper carries the bob; the img carries the mirror, so the two transforms never fight. */}
        <div className="santa-sleigh-scene">
          <img ref={imgRef} src={SLEIGH_TEAM_URL} alt="" className="h-full w-full" draggable={false} />
        </div>
      </div>
    </div>
  );
}
