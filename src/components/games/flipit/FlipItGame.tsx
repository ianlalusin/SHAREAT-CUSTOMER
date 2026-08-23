"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import {
  judgeFlip, judgeRound, averageScore, pickRawStrip, startingNeedle, stepNeedle,
  PERFECT_LO, PERFECT_HI, STRIP_COUNT, type Doneness, type FlipResult,
} from "@/lib/games/flipit/rules";
import { PorkStrip, STRIP_LAYOUT } from "./PorkStrip";
import { recordPlay } from "@/lib/games/recordPlay";

/** The background is 2400x1792; the overlay uses the same pixel space. */
const SCENE_W = 2400;
const SCENE_H = 1792;

const FLOAT_COLOUR: Record<Doneness, string> = {
  raw: "#EFE6D8", perfect: "#4FB477", good: "#F0A02A", under: "#E8845F", burnt: "#B08E78",
};
const PIP_COLOUR: Record<Doneness, string> = {
  raw: "#E4E4E7", perfect: "#4FB477", good: "#C2743F", under: "#E08C6B", burnt: "#4A3128",
};

type Toss = { id: number; score: number; doneness: Doneness };

export function FlipItGame() {
  const [states, setStates] = useState<Doneness[]>(() => Array(STRIP_COUNT).fill("raw"));
  const [scores, setScores] = useState<number[]>([]);
  const [flipping, setFlipping] = useState<number | null>(null);
  const [tosses, setTosses] = useState<Toss[]>([]);
  const [finished, setFinished] = useState<{ verdict: string; flavour: string; avg: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Deterministic on first render, randomised once mounted. Seeding this with
  // startingNeedle() put Math.random() in a state initializer, so the server
  // and the client disagreed about where the needle was and React warned about
  // a hydration mismatch on every load.
  const [needle, setNeedle] = useState<{ position: number; direction: 1 | -1 }>(
    { position: 0, direction: 1 }
  );
  const running = useRef(true);
  const raf = useRef<number | null>(null);
  const posRef = useRef(needle);
  const tossId = useRef(0);

  // Keep a ref alongside the state: the click handler needs the needle's
  // position at the exact moment of the press, and state is a frame behind.
  posRef.current = needle;

  useEffect(() => {
    setNeedle(startingNeedle());
  }, []);

  useEffect(() => {
    const loop = () => {
      if (running.current) setNeedle((n) => stepNeedle(n.position, n.direction));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  const reset = useCallback(() => {
    setStates(Array(STRIP_COUNT).fill("raw"));
    setScores([]);
    setFinished(null);
    setNeedle(startingNeedle());
    running.current = true;
  }, []);

  const onFlip = useCallback(() => {
    if (busy) return;
    if (finished) { reset(); return; }

    const index = pickRawStrip(states);
    if (index < 0) return;

    // A play is a ROUND, not a press — counting every press would make a
    // five-press game look five times more popular than a one-press one.
    if (scores.length === 0) recordPlay("flipit");

    running.current = false;
    setBusy(true);

    const result: FlipResult = judgeFlip(posRef.current.position);
    setFlipping(index);

    // swap the colour while the strip is edge-on, so it reads as turning over
    window.setTimeout(() => {
      setStates((prev) => prev.map((s, i) => (i === index ? result.doneness : s)));
    }, 250);

    window.setTimeout(() => {
      setFlipping(null);
      const nextScores = [...scores, result.score];
      setScores(nextScores);

      if (nextScores.length >= STRIP_COUNT) {
        const avg = averageScore(nextScores);
        const round = judgeRound(avg);
        setFinished({ verdict: round.verdict, flavour: round.flavour, avg });
      } else {
        const id = ++tossId.current;
        setTosses((t) => [...t, { id, score: result.score, doneness: result.doneness }]);
        window.setTimeout(() => setTosses((t) => t.filter((x) => x.id !== id)), 1800);
        setNeedle(startingNeedle());
        running.current = true;
      }
      setBusy(false);
    }, 640);
  }, [busy, finished, states, scores, reset]);

  const label = finished ? "PLAY AGAIN" : "FLIP!";
  const done = scores.length;

  return (
    <div className="w-full max-w-md mx-auto">
      <style>{`
        @keyframes flipit-toss{
          0%{opacity:0;transform:translate(-50%,14px) scale(.55)}
          16%{opacity:1;transform:translate(-50%,-10px) scale(1.14)}
          30%{opacity:1;transform:translate(-50%,0) scale(1)}
          62%{opacity:1;transform:translate(-50%,-14px) scale(1)}
          100%{opacity:0;transform:translate(-50%,-78px) scale(.88)}
        }
        @keyframes flipit-turn{0%{transform:scaleY(1)}50%{transform:scaleY(.05)}100%{transform:scaleY(1)}}
        /* transform-box:fill-box is what makes transform-origin:center mean "the
           middle of THIS strip" — without it an SVG element's origin is the
           user-space 0,0 and the strip swings across the pan. */
        .flipit-slot{transform-box:fill-box;transform-origin:center}
        .flipit-slot.is-turning{animation:flipit-turn .5s ease-in-out both}
        .flipit-float{animation:flipit-toss 1.7s cubic-bezier(.22,.9,.3,1) forwards}
        @keyframes flipit-rise{
          0%{opacity:0;transform:translateY(10px) scale(.5)}
          25%{opacity:.3}
          100%{opacity:0;transform:translateY(-230px) scale(2)}
        }
        .flipit-puff{animation:flipit-rise 4s ease-out infinite;transform-origin:center;filter:blur(14px);opacity:0}
        @media (prefers-reduced-motion:reduce){
          .flipit-slot.is-turning,.flipit-float,.flipit-puff{animation-duration:.01s}
        }
      `}</style>

      {/* ---------------- the pan ---------------- */}
      <div className="relative w-full overflow-hidden rounded-2xl shadow-lg" style={{ aspectRatio: `${SCENE_W}/${SCENE_H}`, background: "#c8703a" }}>
        <Image
          src="/games/flipit/scene.webp"
          alt="A samgyup grill table seen from above"
          fill
          priority
          sizes="(max-width: 480px) 100vw, 480px"
          className="object-cover"
        />

        <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          {states.map((d, i) => (
            <g key={i} className={`flipit-slot${flipping === i ? " is-turning" : ""}`}>
              <PorkStrip doneness={d} place={STRIP_LAYOUT[i]} />
            </g>
          ))}
          <g fill="#fff">
            {[
              { cx: 1010, cy: 760, rx: 70, ry: 52, d: "0s" },
              { cx: 1180, cy: 700, rx: 84, ry: 60, d: "1s" },
              { cx: 1330, cy: 800, rx: 66, ry: 50, d: "2s" },
              { cx: 1120, cy: 920, rx: 76, ry: 56, d: "3s" },
            ].map((p, i) => (
              <ellipse key={i} className="flipit-puff" cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} style={{ animationDelay: p.d }} />
            ))}
          </g>
        </svg>

        {/* score for a single flip — thrown up and gone, so it never sits on
            top of the meat the player just cooked */}
        {tosses.map((t) => (
          <div
            key={t.id}
            className="flipit-float pointer-events-none absolute left-1/2 top-[34%] z-20 font-black tabular-nums"
            style={{
              color: FLOAT_COLOUR[t.doneness],
              fontSize: "clamp(44px,13vw,68px)",
              lineHeight: 1,
              textShadow: "0 2px 4px rgba(0,0,0,.55), 0 6px 22px rgba(0,0,0,.75)",
            }}
          >
            {t.score}
          </div>
        ))}

        {/* the round is over — this one stays put */}
        {finished && (
          <div className="absolute inset-x-2.5 bottom-2.5 z-20 rounded-xl border border-white/10 px-4 py-3 text-center backdrop-blur"
               style={{ background: "rgba(20,16,11,.90)" }}>
            <p className="font-black text-lg" style={{ color: FLOAT_COLOUR[judgeRound(finished.avg).doneness] }}>
              {finished.verdict}
            </p>
            <p className="font-black tabular-nums leading-none my-1" style={{ fontSize: 46, color: FLOAT_COLOUR[judgeRound(finished.avg).doneness] }}>
              {finished.avg}
            </p>
            <p className="text-xs text-white/70">{finished.flavour}</p>
          </div>
        )}
      </div>

      {/* ---------------- progress ---------------- */}
      <div className="mt-3 flex items-center justify-center gap-2">
        {states.map((d, i) => (
          <span key={i} className="h-3 w-8 rounded-full transition-colors" style={{ background: PIP_COLOUR[d] }} />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] uppercase tracking-[.16em] text-muted-foreground">
        {finished ? "Round complete" : `Strip ${done + 1} of ${STRIP_COUNT}`}
      </p>

      {/* ---------------- the heat bar ---------------- */}
      <div
        className="relative mt-4 h-14 overflow-hidden rounded-xl"
        style={{
          background:
            "linear-gradient(90deg,#B8341F 0%,#F0A02A 27%,#4FB477 45%,#4FB477 55%,#F0A02A 73%,#B8341F 100%)",
          boxShadow: "inset 0 2px 10px rgba(0,0,0,.35)",
        }}
      >
        <div
          className="absolute inset-y-0 border-x-2 border-dashed border-white/90"
          style={{ left: `${PERFECT_LO}%`, width: `${PERFECT_HI - PERFECT_LO}%` }}
        />
        <div
          className="absolute -inset-y-1 w-1.5 rounded-full bg-white"
          style={{ left: `calc(${needle.position}% - 3px)`, boxShadow: "0 0 0 2px rgba(0,0,0,.45)" }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[.14em] text-muted-foreground">
        <span>Raw</span><span>Perfect</span><span>Burnt</span>
      </div>

      <button
        type="button"
        onClick={onFlip}
        disabled={busy}
        className="mt-4 h-16 w-full rounded-2xl bg-primary text-xl font-black text-white shadow-md transition active:scale-[0.98] disabled:opacity-70"
      >
        {label}
      </button>
    </div>
  );
}
