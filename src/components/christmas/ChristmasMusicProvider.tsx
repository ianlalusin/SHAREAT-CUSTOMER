"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

const ChristmasMusicContext = createContext<{ muted: boolean; toggle: () => void } | null>(null);

/** Read from wherever the mute toggle is rendered (the footer countdown). */
export function useChristmasMusic() {
  return useContext(ChristmasMusicContext);
}

/**
 * Owns the site-wide ambient Christmas `<audio>` element and mute state.
 * Browsers block autoplay-with-sound, so the track loads muted/paused; the
 * toggle (rendered inside ChristmasFooterCountdown) is the only way sound
 * starts. One of the two royalty-free tracks is picked at random per browser
 * session (sessionStorage), not swapped between page navigations.
 */
export function ChristmasMusicProvider({ children }: { children: React.ReactNode }) {
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

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      window.localStorage.setItem(MUTE_KEY, String(next));
      return next;
    });
  }, []);

  const active = isCustomerFacingRoute(pathname ?? "/");

  return (
    <ChristmasMusicContext.Provider value={{ muted, toggle }}>
      {active && track ? <audio ref={audioRef} src={track} loop preload="none" /> : null}
      {children}
    </ChristmasMusicContext.Provider>
  );
}
