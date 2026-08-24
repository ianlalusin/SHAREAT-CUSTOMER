"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import {
  judgeFlip, judgeRound, averageScore, pickRawStrip, startingNeedle, stepNeedle,
  PERFECT_LO, PERFECT_HI, STRIP_COUNT, type Doneness, type FlipResult,
} from "@/lib/games/flipit/rules";
import { PorkStrip, STRIP_LAYOUT } from "./PorkStrip";
import { ScorePrompt, LeaderboardSheet } from "./Leaderboard";
import type { Leaderboard } from "@/lib/games/flipit/leaderboard";
import { Trophy } from "lucide-react";
import { markView, resetSignals, signalUse } from "@/lib/games/trackGame";

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

  // The board, and the copy of it handed back by a successful post so the
  // sheet opens on the numbers that were just written rather than re-fetching.
  const [boardOpen, setBoardOpen] = useState(false);
  const [postedBoard, setPostedBoard] = useState<Leaderboard | null>(null);
  const [postedName, setPostedName] = useState<string | undefined>(undefined);

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
  const timers = useRef<number[]>([]);

  /** Every timeout this game starts, so none of them outlives the screen.
   *  Walking away mid-flip used to leave three of them running, setting state
   *  on a component that no longer exists. */
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  // Keep a ref alongside the state: the click handler needs the needle's
  // position at the moment of the press, and state is a frame behind. Written
  // in an effect rather than during render, so it holds exactly the position
  // the player was looking at when they pressed.
  useEffect(() => {
    posRef.current = needle;
  }, [needle]);

  useEffect(() => {
    setNeedle(startingNeedle());
    // A VIEW is opening the game. A USE is finishing a round of five, which
    // the shared tracker closes once five flips have been signalled.
    markView("flipit");
    resetSignals("flipit");
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
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
    // A fresh round counts from zero, or an abandoned one would leave the
    // tracker part-way and close the next round early.
    resetSignals("flipit");
  }, []);

  const onFlip = useCallback(() => {
    if (busy) return;
    if (finished) { reset(); return; }

    const index = pickRawStrip(states);
    if (index < 0) return;

    // One raw signal per press. Five of them are one use — the threshold lives
    // in the registry, not here, so every game is counted by the same rule.
    signalUse("flipit");

    running.current = false;
    setBusy(true);

    const result: FlipResult = judgeFlip(posRef.current.position);
    setFlipping(index);

    // swap the colour while the strip is edge-on, so it reads as turning over
    later(() => {
      setStates((prev) => prev.map((s, i) => (i === index ? result.doneness : s)));
    }, 250);

    later(() => {
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
        later(() => setTosses((t) => t.filter((x) => x.id !== id)), 1800);
        setNeedle(startingNeedle());
        running.current = true;
      }
      setBusy(false);
    }, 640);
  }, [busy, finished, states, scores, reset, later]);

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

      {/* Asked only once the round is over, and skippable in one tap: the score
          is already on screen, so this is a bonus and not a toll gate. */}
      {finished && (
        <ScorePrompt
          scores={scores}
          onPosted={(board, placed) => {
            setPostedBoard(board);
            if (placed) {
              setPostedName(lastNameUsed());
              setBoardOpen(true);
            }
          }}
        />
      )}

      <button
        type="button"
        onClick={() => {
          // Drop the copy handed back by the last post so the sheet fetches:
          // other people have been grilling since.
          setPostedBoard(null);
          setBoardOpen(true);
        }}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-bold text-muted-foreground transition active:scale-[0.99]"
      >
        <Trophy className="h-4 w-4" />
        Leaderboard
      </button>

      <LeaderboardSheet
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        board={postedBoard}
        highlightName={postedName}
      />
    </div>
  );
}

/** What they signed the last post with, for highlighting their own row. */
function lastNameUsed(): string | undefined {
  try {
    return localStorage.getItem("shareat_flipit_name") || undefined;
  } catch {
    return undefined;
  }
}
