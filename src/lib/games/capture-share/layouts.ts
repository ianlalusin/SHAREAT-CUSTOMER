/**
 * Capture & Share layouts — pure geometry, no DOM, so it is testable.
 *
 * Every layout is a white "card" of `w`×`h` canvas pixels holding photo slots
 * and a footer band (logo + "We sharelebrated at …" + date). `tiltDeg` draws
 * the finished card rotated on a coloured backdrop (the tilted Instax).
 *
 * `paper58` is whether the layout survives 57/58mm thermal paper (48mm wide
 * printable). Unused until POS printing ships; the 2-photo and 2×2 layouts are
 * too small on that paper (owner's call, 2026-11-21).
 */

export type Slot = { x: number; y: number; w: number; h: number };

export type Layout = {
  id: string;
  label: string;
  shots: number;
  w: number;
  h: number;
  slots: Slot[];
  /** Footer band inside the card: logo on the left, two text lines beside it. */
  footer: Slot;
  tiltDeg?: number;
  paper58: boolean;
};

// Instax Square card is 72×86mm with a 62mm image — the same proportions here.
const INSTAX: Omit<Layout, "id" | "label" | "tiltDeg"> = {
  shots: 1,
  w: 1080,
  h: 1290,
  slots: [{ x: 75, y: 75, w: 930, h: 930 }],
  footer: { x: 75, y: 1035, w: 930, h: 215 },
  paper58: true,
};

export const LAYOUTS: Layout[] = [
  { id: "instax", label: "Instax", ...INSTAX },
  { id: "instax-tilt", label: "Instax tilted", ...INSTAX, tiltDeg: -10 },
  {
    id: "duo",
    label: "2 photos",
    shots: 2,
    w: 1080,
    h: 1350,
    // Big square top-left; a half-size square overlapping its bottom-right corner.
    slots: [
      { x: 60, y: 60, w: 720, h: 720 },
      { x: 660, y: 660, w: 360, h: 360 },
    ],
    footer: { x: 60, y: 1080, w: 960, h: 220 },
    paper58: false,
  },
  {
    id: "strip3",
    label: "Strip of 3",
    shots: 3,
    w: 600,
    h: 1800,
    slots: [0, 1, 2].map((i) => ({ x: 40, y: 40 + i * 480, w: 520, h: 450 })),
    footer: { x: 40, y: 1490, w: 520, h: 270 },
    paper58: true,
  },
  {
    id: "strip4",
    label: "Strip of 4",
    shots: 4,
    w: 600,
    h: 1800,
    slots: [0, 1, 2, 3].map((i) => ({ x: 40, y: 40 + i * 370, w: 520, h: 340 })),
    footer: { x: 40, y: 1530, w: 520, h: 230 },
    paper58: true,
  },
  {
    id: "grid",
    label: "2×2 grid",
    shots: 4,
    w: 1080,
    h: 1350,
    slots: [0, 1, 2, 3].map((i) => ({ x: 50 + (i % 2) * 515, y: 50 + Math.floor(i / 2) * 515, w: 465, h: 465 })),
    footer: { x: 50, y: 1080, w: 980, h: 230 },
    paper58: false,
  },
];

export function getLayout(id: string): Layout | null {
  return LAYOUTS.find((l) => l.id === id) ?? null;
}

/** The backdrop canvas a tilted card needs so no corner is cut off. */
export function outerSize(l: Layout): { w: number; h: number } {
  if (!l.tiltDeg) return { w: l.w, h: l.h };
  const r = (Math.abs(l.tiltDeg) * Math.PI) / 180;
  const pad = 80;
  return {
    w: Math.ceil(l.w * Math.cos(r) + l.h * Math.sin(r)) + pad * 2,
    h: Math.ceil(l.w * Math.sin(r) + l.h * Math.cos(r)) + pad * 2,
  };
}

/**
 * Source rectangle that fills `slot` without stretching (CSS object-fit: cover).
 */
export function coverCrop(srcW: number, srcH: number, slot: { w: number; h: number }) {
  const scale = Math.max(slot.w / srcW, slot.h / srcH);
  const sw = slot.w / scale;
  const sh = slot.h / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** "We sharelebrated at SharEat Lipa" — the store's own name, never hard-coded. */
export function captionLine(storeName: string): string {
  const name = storeName.trim() || "SharEat";
  return `We sharelebrated at ${name}`;
}

/** Shown beside the checkbox and saved word-for-word with each consented photo. */
export const CONSENT_TEXT =
  "SharEat may post this photo on its Facebook, Instagram, TikTok, YouTube and X pages. Message our page anytime to have it removed.";
