"use client";

import { PlayHeader } from "@/components/games/PlayHeader";
import { CaptureShareGame } from "@/components/games/capture-share/CaptureShareGame";

/** Photo booth: pick a layout, shoot, decorate, save or share. Nothing is uploaded without consent. */
export default function CaptureSharePage() {
  return (
    <>
      <PlayHeader title="Capture & Share" subtitle="Your SharEat moment, framed." backHref="/play" />
      <main className="mx-auto max-w-3xl px-4 py-5 pb-16">
        <CaptureShareGame />
      </main>
    </>
  );
}
