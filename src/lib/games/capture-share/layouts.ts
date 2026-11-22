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

export type TemplateKind = "ticket" | "idcard" | "boarding" | "magazine" | "wanted" | "certificate" | "movie" | "receipt" | "nowplaying";

/** A line of text the guest may change on a template. Everything else on it is locked. */
export type TemplateField = {
  id: string;
  label: string;
  maxLength: number;
  /** Starting text; "{name}" is replaced with the guest's name from the table. */
  defaultValue: string;
};

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
  /** A designed template drawn by render.ts instead of the plain white card. */
  template?: TemplateKind;
  fields?: TemplateField[];
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

/**
 * Designed templates: one photo, a few lines the guest can change, the rest
 * locked (stub, barcode, branding). Geometry here, the artwork in render.ts.
 */
export const TEMPLATES: Layout[] = [
  {
    id: "ticket",
    label: "Ticket",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 150, y: 300, w: 780, h: 780 }],
    // The whole stub below the tear line is locked: stickers stay off it.
    footer: { x: 60, y: 1100, w: 960, h: 340 },
    paper58: true,
    template: "ticket",
    fields: [{ id: "title", label: "Ticket title", maxLength: 24, defaultValue: "Samgyup Night" }],
  },
  {
    id: "idcard",
    label: "ID card",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 280, y: 370, w: 520, h: 650 }],
    footer: { x: 60, y: 1290, w: 960, h: 150 },
    paper58: true,
    template: "idcard",
    fields: [
      { id: "school", label: "School name", maxLength: 28, defaultValue: "SharEat University" },
      { id: "name", label: "Your name", maxLength: 24, defaultValue: "{name}" },
      { id: "course", label: "Course", maxLength: 28, defaultValue: "BS Samgyupsal" },
      { id: "motto", label: "Motto", maxLength: 50, defaultValue: "Eat. Grill. Repeat." },
    ],
  },
  {
    id: "boarding",
    label: "Boarding pass",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 96, y: 370, w: 888, h: 588 }],
    footer: { x: 54, y: 1220, w: 972, h: 226 },
    paper58: true,
    template: "boarding",
    fields: [
      { id: "name", label: "Passenger name", maxLength: 24, defaultValue: "{name}" },
      { id: "to", label: "Destination", maxLength: 16, defaultValue: "Busog City" },
    ],
  },
  {
    id: "magazine",
    label: "Magazine cover",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 0, y: 0, w: 1080, h: 1362 }],
    footer: { x: 0, y: 1362, w: 1080, h: 138 },
    paper58: true,
    template: "magazine",
    fields: [
      { id: "headline", label: "Headline", maxLength: 32, defaultValue: "Grill Master of the Year" },
      { id: "name", label: "Your name", maxLength: 24, defaultValue: "{name}" },
    ],
  },
  {
    id: "wanted",
    label: "Wanted poster",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 210, y: 350, w: 660, h: 570 }],
    footer: { x: 42, y: 1250, w: 996, h: 208 },
    paper58: true,
    template: "wanted",
    fields: [
      { id: "name", label: "Name", maxLength: 24, defaultValue: "{name}" },
      { id: "crime", label: "Wanted for", maxLength: 44, defaultValue: "Eating 12 rounds of pork belly" },
    ],
  },
  {
    id: "certificate",
    label: "Certificate",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 315, y: 330, w: 450, h: 450 }],
    footer: { x: 36, y: 1250, w: 1008, h: 214 },
    paper58: true,
    template: "certificate",
    fields: [
      { id: "name", label: "Name", maxLength: 26, defaultValue: "{name}" },
      { id: "award", label: "Award", maxLength: 24, defaultValue: "Grill Master" },
    ],
  },
  {
    id: "movie",
    label: "Movie poster",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 0, y: 0, w: 1080, h: 990 }],
    footer: { x: 0, y: 1340, w: 1080, h: 160 },
    paper58: true,
    template: "movie",
    fields: [
      { id: "title", label: "Movie title", maxLength: 22, defaultValue: "The Last Round" },
      { id: "tagline", label: "Tagline", maxLength: 40, defaultValue: "One grill. Unlimited pork. No regrets." },
    ],
  },
  {
    id: "receipt",
    label: "Receipt",
    shots: 1,
    w: 1080,
    h: 1500,
    slots: [{ x: 237, y: 300, w: 606, h: 360 }],
    // Everything under the "Celebrating" line is the locked receipt.
    footer: { x: 195, y: 760, w: 690, h: 698 },
    paper58: true,
    template: "receipt",
    fields: [{ id: "celebrating", label: "Celebrating", maxLength: 28, defaultValue: "Samgyup night" }],
  },
  {
    id: "nowplaying",
    label: "Now playing",
    shots: 1,
    w: 1080,
    h: 1770,
    slots: [{ x: 66, y: 160, w: 948, h: 948 }],
    // Player controls and branding are locked; stickers stay on the cover and title area.
    footer: { x: 0, y: 1270, w: 1080, h: 500 },
    paper58: true,
    template: "nowplaying",
    fields: [
      { id: "song", label: "Song title", maxLength: 28, defaultValue: "Busog Na Busog" },
      { id: "artist", label: "Artist", maxLength: 24, defaultValue: "{name}" },
    ],
  },
];

/** Starting values for a template's fields, with the guest's name filled in. */
export function defaultFields(l: Layout, guestName: string): Record<string, string> {
  const name = guestName.trim() || "Your Name";
  return Object.fromEntries((l.fields ?? []).map((f) => [f.id, f.defaultValue.replace("{name}", name).slice(0, f.maxLength)]));
}

export function getLayout(id: string): Layout | null {
  return [...LAYOUTS, ...TEMPLATES].find((l) => l.id === id) ?? null;
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
  "Send us your photo. We pick our favorites to post on SharEat's Facebook, Instagram, TikTok, YouTube and X.";

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The logo + caption strip in finished-canvas pixels, as an upright box. On the
 * tilted Instax the strip is rotated, so this is the box around it (a little
 * larger) — erring on keeping stickers clear of the branding.
 */
export function footerBox(l: Layout, margin = 12): Box {
  const f = l.footer;
  if (!l.tiltDeg) return { x: f.x - margin, y: f.y - margin, w: f.w + margin * 2, h: f.h + margin * 2 };
  const o = outerSize(l);
  const r = (l.tiltDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const pts = [
    [f.x, f.y],
    [f.x + f.w, f.y],
    [f.x, f.y + f.h],
    [f.x + f.w, f.y + f.h],
  ].map(([x, y]) => {
    const dx = x - l.w / 2;
    const dy = y - l.h / 2;
    return [o.w / 2 + dx * cos - dy * sin, o.h / 2 + dx * sin + dy * cos];
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return { x, y, w: Math.max(...xs) + margin - x, h: Math.max(...ys) + margin - y };
}

/** Half-extents of the upright box around a rotated sticker. */
export function rotatedExtents(halfW: number, halfH: number, rot: number) {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  return { ex: c * halfW + s * halfH, ey: s * halfW + c * halfH };
}

/**
 * Where a sticker centred at (x, y) with half-extents (ex, ey) may sit: inside
 * the canvas and never over `block` (the logo + caption). When it would
 * overlap, it is pushed out by the shortest way that still fits the canvas.
 */
export function keepClear(x: number, y: number, ex: number, ey: number, canvas: { w: number; h: number }, block: Box) {
  const inside = (v: number, e: number, max: number) => Math.min(Math.max(v, Math.min(e, max / 2)), Math.max(max - e, max / 2));
  x = inside(x, ex, canvas.w);
  y = inside(y, ey, canvas.h);
  const overlaps = x + ex > block.x && x - ex < block.x + block.w && y + ey > block.y && y - ey < block.y + block.h;
  if (!overlaps) return { x, y };
  const options = [
    { x, y: block.y - ey },
    { x, y: block.y + block.h + ey },
    { x: block.x - ex, y },
    { x: block.x + block.w + ex, y },
  ].filter((p) => p.x - ex >= 0 && p.x + ex <= canvas.w && p.y - ey >= 0 && p.y + ey <= canvas.h);
  if (!options.length) return { x, y: inside(block.y - ey, ey, canvas.h) };
  return options.reduce((best, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best));
}

/**
 * Tone curve for the PRINTED copy's photos only (0-255 in, 0-255 out). Thermal dots
 * spread, so dark photo areas print as solid black; this lifts the shadows and
 * brightens mid-tones. White stays white. Text, logo and frame are not passed
 * through it, so they print as dark as before.
 */
export function printTone(v: number): number {
  return Math.round(255 * (0.12 + 0.88 * Math.pow(v / 255, 0.8)));
}
