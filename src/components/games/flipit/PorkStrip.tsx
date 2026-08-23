import type { Doneness } from "@/lib/games/flipit/rules";

/**
 * One strip of pork belly on the pan.
 *
 * Pork belly is LAYERED — meat, fat, meat, fat. Drawn as a single rounded rect
 * with one fill it reads as a hot dog; the stripes are what make it samgyupsal.
 *
 * Colours are literal hex, not Tailwind classes and not CSS variables sourced
 * from a config file: Tailwind does not scan src/lib, so a class stored outside
 * src/components would generate no CSS at all and the strip would render
 * invisible. See the verifying-ui-in-a-browser notes.
 */
const PALETTE: Record<Doneness, { meat: string; fat: string; marks: number; char: boolean }> = {
  raw:     { meat: "#EFA396", fat: "#FBE7DE", marks: 0, char: false },
  under:   { meat: "#E08C6B", fat: "#F9DFCB", marks: 1, char: false },
  good:    { meat: "#C2743F", fat: "#F0D9BB", marks: 2, char: false },
  perfect: { meat: "#A85C2F", fat: "#EBCDA6", marks: 3, char: false },
  burnt:   { meat: "#4A3128", fat: "#6B4B39", marks: 3, char: true },
};

const MARK = "#753C1B";
const CHAR = "#241611";

export type StripPlacement = { cx: number; cy: number; rot: number };

/** Fixed positions on the pan, in the background image's own pixel space. */
export const STRIP_LAYOUT: StripPlacement[] = [
  { cx: 1000, cy: 640,  rot: -16 },
  { cx: 1330, cy: 700,  rot: 14 },
  { cx: 1000, cy: 960,  rot: 11 },
  { cx: 1330, cy: 1000, rot: -13 },
  { cx: 1168, cy: 818,  rot: 46 },
];

export const STRIP_W = 300;
export const STRIP_H = 104;

export function PorkStrip({
  doneness,
  place,
  w = STRIP_W,
  h = STRIP_H,
}: {
  doneness: Doneness;
  place: StripPlacement;
  w?: number;
  h?: number;
}) {
  const p = PALETTE[doneness];
  const { cx, cy, rot } = place;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = h * 0.22;

  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={p.meat} />

      {/* fat runs the length of the strip */}
      <rect x={x + w * 0.02} y={y + h * 0.17} width={w * 0.96} height={h * 0.15} rx={h * 0.06} fill={p.fat} />
      <rect x={x + w * 0.02} y={y + h * 0.49} width={w * 0.96} height={h * 0.12} rx={h * 0.05} fill={p.fat} opacity={0.92} />
      <rect x={x + w * 0.02} y={y + h * 0.74} width={w * 0.96} height={h * 0.09} rx={h * 0.04} fill={p.fat} opacity={0.7} />

      {/* sear bars run ACROSS, the way grill bars actually mark meat */}
      {Array.from({ length: p.marks }, (_, i) => (
        <rect
          key={i}
          x={x + w * (0.2 + i * 0.28)}
          y={y + h * 0.1}
          width={w * 0.045}
          height={h * 0.8}
          rx={w * 0.02}
          fill={MARK}
          opacity={p.char ? 0.4 : 0.5}
        />
      ))}

      {p.char && (
        <>
          <circle cx={x + w * 0.3} cy={y + h * 0.34} r={h * 0.1} fill={CHAR} />
          <circle cx={x + w * 0.58} cy={y + h * 0.7} r={h * 0.085} fill={CHAR} />
          <circle cx={x + w * 0.8} cy={y + h * 0.28} r={h * 0.07} fill={CHAR} />
        </>
      )}

      {doneness !== "raw" && (
        <>
          <circle cx={x + w * 0.4} cy={y + h * 0.3} r={h * 0.045} fill="#fff" opacity={0.5} />
          <circle cx={x + w * 0.7} cy={y + h * 0.64} r={h * 0.04} fill="#fff" opacity={0.42} />
        </>
      )}

      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke="rgba(0,0,0,.16)" strokeWidth={h * 0.03} />
    </g>
  );
}
