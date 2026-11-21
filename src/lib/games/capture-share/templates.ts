"use client";

import { captionLine, coverCrop, type Layout } from "./layouts";

/**
 * Artwork for the designed templates (Ticket, ID card). Geometry and the
 * editable fields live in layouts.ts; only the guest's fields change here —
 * the stub, barcode, ID details and SharEat branding are locked.
 */

export type TemplateInfo = {
  storeName: string;
  dateText: string;
  tableName: string;
  fields: Record<string, string>;
};

const RED = "#d62828";
const INK = "#18181b";
const MUTED = "#71717a";
const FONT = "Arial, Helvetica, sans-serif";

type FontFn = (px: number) => string;

/** Largest size (≤ maxPx) at which `text` fits `maxW` in at most `maxLines` lines (and `maxH` tall, when given). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxPx: number, font: FontFn, maxLines: number, maxH = Infinity) {
  for (let px = maxPx; px >= 14; px -= 2) {
    ctx.font = font(px);
    const lines: string[] = [];
    let cur = "";
    for (const w of text.split(" ")) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    const fits = lines.length <= maxLines && lines.length * px * 1.12 <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW);
    if (fits) return { px, lines };
  }
  ctx.font = font(14);
  return { px: 14, lines: [text] };
}

/** Centred lines of text inside a band, vertically centred. */
function centred(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, h: number, maxW: number, maxPx: number, font: FontFn, maxLines: number, color: string) {
  const fit = fitText(ctx, text, maxW, maxPx, font, maxLines, h);
  const lineH = fit.px * 1.12;
  let y = top + (h - fit.lines.length * lineH) / 2;
  ctx.font = font(fit.px);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const line of fit.lines) {
    ctx.fillText(line, cx, y);
    y += lineH;
  }
  ctx.textAlign = "start";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Decorative barcode: stripes from a seed, so the same day and branch always look the same. */
function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: string) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  ctx.fillStyle = INK;
  let cx = x;
  while (cx < x + w) {
    const bar = 3 + Math.floor(rand() * 4) * 3;
    if (cx + bar > x + w) break;
    ctx.fillRect(cx, y, bar, h);
    cx += bar + 3 + Math.floor(rand() * 3) * 3;
  }
}

function photo(ctx: CanvasRenderingContext2D, shot: HTMLCanvasElement | undefined, slot: Layout["slots"][number]) {
  if (!shot) return;
  const { sx, sy, sw, sh } = coverCrop(shot.width, shot.height, slot);
  ctx.drawImage(shot, sx, sy, sw, sh, slot.x, slot.y, slot.w, slot.h);
}

function branding(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number, textX: number, maxW: number, info: TemplateInfo, second: string) {
  if (logo) ctx.drawImage(logo, x, y, size, size);
  const cap = fitText(ctx, captionLine(info.storeName), maxW, 40, (px) => `900 ${px}px ${FONT}`, 1);
  ctx.textBaseline = "top";
  ctx.fillStyle = INK;
  ctx.font = `900 ${cap.px}px ${FONT}`;
  ctx.fillText(cap.lines[0], textX, y + size / 2 - cap.px - 4);
  const sub = fitText(ctx, second, maxW, 26, (px) => `700 ${px}px ${FONT}`, 1);
  ctx.fillStyle = MUTED;
  ctx.font = `700 ${sub.px}px ${FONT}`;
  ctx.fillText(sub.lines[0], textX, y + size / 2 + 8);
}

export function drawTicket(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const H = l.h;
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, H);

  // Ticket body with the two tear-line notches cut out.
  const tear = 1110;
  ctx.fillStyle = "#fff8ec";
  roundRect(ctx, 60, 60, W - 120, H - 120, 36);
  ctx.fill();
  ctx.fillStyle = RED;
  for (const nx of [60, W - 60]) {
    ctx.beginPath();
    ctx.arc(nx, tear, 42, 0, Math.PI * 2);
    ctx.fill();
  }

  centred(ctx, "★  ADMIT ONE  ★", W / 2, 104, 46, 700, 32, (px) => `900 ${px}px ${FONT}`, 1, RED);
  const title = (info.fields.title || "Samgyup Night").toUpperCase();
  centred(ctx, title, W / 2, 150, 140, 820, 92, (px) => `900 ${px}px ${FONT}`, 2, INK);

  const slot = l.slots[0];
  ctx.fillStyle = INK;
  ctx.fillRect(slot.x - 8, slot.y - 8, slot.w + 16, slot.h + 16);
  photo(ctx, shot, slot);

  // Tear line.
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = "#c9b48f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(116, tear);
  ctx.lineTo(W - 116, tear);
  ctx.stroke();
  ctx.setLineDash([]);

  // Locked stub: branding, date and table, barcode and ticket number.
  branding(ctx, logo, 110, 1150, 130, 270, W - 270 - 110, info, `${info.dateText}${info.tableName ? `  ·  ${info.tableName}` : ""}`);
  barcode(ctx, 110, 1310, W - 220, 70, `${info.storeName}|${info.dateText}`);
  const digits = [...`${info.storeName}|${info.dateText}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000000, 0);
  const no = `No. ${String(digits).padStart(6, "0")}`;
  centred(ctx, no, W / 2, 1386, 30, 600, 22, (px) => `700 ${px}px ${FONT}`, 1, MUTED);
}

export function drawIdCard(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const H = l.h;
  ctx.fillStyle = "#e4e4e7";
  ctx.fillRect(0, 0, W, H);

  // Card with a red header band, clipped to its rounded corners.
  ctx.save();
  roundRect(ctx, 60, 60, W - 120, H - 120, 48);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(60, 60, W - 120, H - 120);
  ctx.fillStyle = RED;
  ctx.fillRect(60, 60, W - 120, 280);
  ctx.restore();

  // Lanyard slot.
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, W / 2 - 80, 92, 160, 26, 13);
  ctx.fill();

  centred(ctx, "STUDENT ID", W / 2, 136, 40, 600, 28, (px) => `900 ${px}px ${FONT}`, 1, "#ffd5d5");
  centred(ctx, info.fields.school || "SharEat University", W / 2, 180, 140, 860, 64, (px) => `900 ${px}px ${FONT}`, 2, "#ffffff");

  const slot = l.slots[0];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(slot.x - 12, slot.y - 12, slot.w + 24, slot.h + 24);
  ctx.strokeStyle = "#d4d4d8";
  ctx.lineWidth = 3;
  ctx.strokeRect(slot.x - 12, slot.y - 12, slot.w + 24, slot.h + 24);
  photo(ctx, shot, slot);

  centred(ctx, (info.fields.name || "Your Name").toUpperCase(), W / 2, 1040, 80, 880, 68, (px) => `900 ${px}px ${FONT}`, 1, INK);
  centred(ctx, (info.fields.course || "").toUpperCase(), W / 2, 1118, 44, 860, 32, (px) => `700 ${px}px ${FONT}`, 1, RED);
  const motto = (info.fields.motto || "").trim();
  if (motto) centred(ctx, `“${motto}”`, W / 2, 1168, 104, 820, 36, (px) => `italic 600 ${px}px ${FONT}`, 2, "#3f3f46");

  // Locked footer: branding and the fun validity line.
  ctx.fillStyle = "#e4e4e7";
  ctx.fillRect(110, 1288, W - 220, 3);
  branding(ctx, logo, 110, 1305, 115, 250, W - 250 - 110, info, `Valid for: Unlimited Samgyupsal  ·  ${info.dateText}`);
}
