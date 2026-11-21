"use client";

import { captionLine, coverCrop, outerSize, type Layout } from "./layouts";

/** A sticker or a line of text the diner placed, in finished-canvas pixels. */
export type Overlay = {
  id: string;
  kind: "emoji" | "text";
  text: string;
  x: number;
  y: number;
  /** Font size in canvas pixels. */
  size: number;
  /** The size it was added at; pinching and the minus button never go below it. */
  minSize: number;
  /** Rotation in radians, about the sticker's centre. */
  rot: number;
  color: string;
};

export type Shot = HTMLCanvasElement;

const BACKDROP = "#d62828";
const FONT = "Arial, Helvetica, sans-serif";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Freeze the current video frame. Front camera is mirrored, as the preview was. */
export function grabFrame(video: HTMLVideoElement, mirror: boolean): Shot {
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext("2d")!;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return c;
}

/** Largest font size (≤ max) at which `text` fits `maxW` in at most 2 lines. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number, weight: number) {
  for (let px = max; px >= 12; px -= 2) {
    ctx.font = `${weight} ${px}px ${FONT}`;
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) return { px, lines };
  }
  return { px: 12, lines: [text] };
}

function drawCard(layout: Layout, shots: Shot[], storeName: string, dateText: string, logo: HTMLImageElement | null) {
  const c = document.createElement("canvas");
  c.width = layout.w;
  c.height = layout.h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);

  layout.slots.forEach((slot, i) => {
    const shot = shots[i];
    if (!shot) return;
    // The small duo photo sits on the big one; a white mat keeps it readable.
    if (i > 0 && layout.id === "duo") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(slot.x - 16, slot.y - 16, slot.w + 32, slot.h + 32);
    }
    const { sx, sy, sw, sh } = coverCrop(shot.width, shot.height, slot);
    ctx.drawImage(shot, sx, sy, sw, sh, slot.x, slot.y, slot.w, slot.h);
  });

  const f = layout.footer;
  const logoSize = Math.min(f.h, f.w * 0.3);
  if (logo) ctx.drawImage(logo, f.x, f.y + (f.h - logoSize) / 2, logoSize, logoSize);

  const tx = f.x + logoSize + f.h * 0.12;
  const maxW = f.x + f.w - tx;
  const cap = fitLines(ctx, captionLine(storeName), maxW, Math.round(f.h * 0.26), 900);
  const datePx = Math.max(12, Math.round(cap.px * 0.75));
  const lineH = cap.px * 1.15;
  const block = cap.lines.length * lineH + datePx * 1.4;
  let y = f.y + (f.h - block) / 2;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#18181b";
  ctx.font = `900 ${cap.px}px ${FONT}`;
  for (const line of cap.lines) {
    ctx.fillText(line, tx, y);
    y += lineH;
  }
  ctx.fillStyle = "#71717a";
  ctx.font = `700 ${datePx}px ${FONT}`;
  ctx.fillText(dateText, tx, y + datePx * 0.3);
  return c;
}

/** The collage without stickers: card, or the tilted card on its backdrop. */
export function renderBase(layout: Layout, shots: Shot[], storeName: string, dateText: string, logo: HTMLImageElement | null) {
  const card = drawCard(layout, shots, storeName, dateText, logo);
  if (!layout.tiltDeg) return card;

  const { w, h } = outerSize(layout);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((layout.tiltDeg * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(card, -layout.w / 2, -layout.h / 2);
  return c;
}

const emojiFont = (px: number) => `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
const textFont = (px: number) => `900 ${px}px ${FONT}`;

let measureCtx: CanvasRenderingContext2D | null = null;

/** Half-width / half-height of a sticker as drawn — used for tapping and the selection box. */
export function overlayBox(o: Overlay): { halfW: number; halfH: number } {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = o.kind === "emoji" ? emojiFont(o.size) : textFont(o.size);
  const pad = o.size * 0.15;
  return { halfW: measureCtx.measureText(o.text).width / 2 + pad, halfH: o.size * 0.6 + pad };
}

export function drawOverlays(ctx: CanvasRenderingContext2D, overlays: Overlay[]) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const o of overlays) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot || 0);
    if (o.kind === "emoji") {
      ctx.font = emojiFont(o.size);
      ctx.fillText(o.text, 0, 0);
    } else {
      ctx.font = textFont(o.size);
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, o.size * 0.16);
      ctx.strokeStyle = o.color === "#ffffff" ? "#000000" : "#ffffff";
      ctx.strokeText(o.text, 0, 0);
      ctx.fillStyle = o.color;
      ctx.fillText(o.text, 0, 0);
    }
    ctx.restore();
  }
  ctx.textAlign = "start";
}

/** The finished JPEG: base collage plus the diner's stickers and text. */
export function renderFinal(base: HTMLCanvasElement, overlays: Overlay[]): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  drawOverlays(ctx, overlays);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}
