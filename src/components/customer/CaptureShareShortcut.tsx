"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { cn } from "@/lib/utils";

/** Owner's lines, shown one at a time. */
export const NUDGES = ["Try me!", "Let's capture the moment", "New feature here!", "Lights, camera, gotcha!", "Sharelebration shoot!"];
const EVERY_MS = 15_000;
const SHOW_MS = 5_000;
const FIRST_MS = 2_000;

/**
 * The floating Capture & Share button (bottom-left; the feedback bubble owns
 * bottom-right). A speech bubble above it shows the next nudge line every 15s
 * for 5s, so the button gets noticed without nagging.
 *
 * The bubble sits ABOVE the button, not beside it: beside it would run into
 * the "Rate our Service" button on narrow phones.
 */
export function CaptureShareShortcut() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let n = 0;
    const show = () => {
      setIndex(n++ % NUDGES.length);
      setVisible(true);
      hideTimer = setTimeout(() => setVisible(false), SHOW_MS);
    };
    const first = setTimeout(show, FIRST_MS);
    const loop = setInterval(show, EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(loop);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div className="fixed bottom-5 left-5 z-50">
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute bottom-[4.25rem] left-0 w-max max-w-[150px] rounded-2xl bg-primary px-3 py-2 text-sm font-black leading-tight text-white shadow-xl transition-all duration-300 motion-reduce:transition-none",
          visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {NUDGES[index]}
        {/* Tail pointing down at the camera button. */}
        <span className="absolute -bottom-1.5 left-5 h-3 w-3 rotate-45 bg-primary" />
      </div>
      <button
        type="button"
        onClick={() => router.push("/play/capture-share")}
        aria-label="Open Capture & Share camera"
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-primary shadow-xl ring-2 ring-primary/30 transition-all hover:scale-105 active:scale-95",
          visible && "ring-4 ring-primary motion-safe:animate-bounce"
        )}
      >
        <Camera className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}
