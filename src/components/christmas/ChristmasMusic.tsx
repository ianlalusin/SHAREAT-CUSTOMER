"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isCustomerFacingRoute } from "@/lib/christmas-countdown";

const TRACKS = ["/audio/christmas-jingle-bells.mp3", "/audio/christmas-nostalgic-strings.mp3"];
const SESSION_KEY = "christmasTrackChoice";
const MUTE_KEY = "christmasMusicMuted";

function pickTrack(): string {
  if (typeof window === "undefined") return TRACKS[0];
  const cached = window.sessionStorage.getItem(SESSION_KEY);
  if (cached && TRACKS.includes(cached)) return cached;
  const choice = TRACKS[Math.random() < 0.5 ? 0 : 1];
  window.sessionStorage.setItem(SESSION_KEY, choice);
  return choice;
}

/**
 * Site-wide ambient Christmas music. Browsers block autoplay-with-sound, so
 * the track loads muted/paused; the toggle is the only way sound starts.
 * One of the two royalty-free tracks is picked at random per browser
 * session (sessionStorage), not swapped between page navigations.
 */
export function ChristmasMusic() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [track, setTrack] = useState<string | null>(null);

  useEffect(() => {
    setTrack(pickTrack());
    const storedMute = window.localStorage.getItem(MUTE_KEY);
    setMuted(storedMute === null ? true : storedMute === "true");
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.volume = 0;
    if (!muted) {
      audio.play().catch(() => {
        // Autoplay can still be refused (e.g. no prior user gesture) —
        // the toggle stays visible so the visitor can retry.
      });
      let v = 0;
      const fade = setInterval(() => {
        v = Math.min(v + 0.05, 0.35);
        audio.volume = v;
        if (v >= 0.35) clearInterval(fade);
      }, 100);
      return () => clearInterval(fade);
    }
    audio.pause();
  }, [muted, track]);

  if (!isCustomerFacingRoute(pathname ?? "/") || !track) return null;

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    window.localStorage.setItem(MUTE_KEY, String(next));
  };

  return (
    <>
      <audio ref={audioRef} src={track} loop preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-label={muted ? "Play Christmas music" : "Mute Christmas music"}
        aria-pressed={!muted}
        className="fixed left-3 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white shadow-lg active:scale-95 transition"
      >
        <span className="text-lg" aria-hidden="true">{muted ? "🔇" : "🔈"}</span>
      </button>
    </>
  );
}
