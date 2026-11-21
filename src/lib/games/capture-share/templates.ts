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

function branding(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  textX: number,
  maxW: number,
  info: TemplateInfo,
  second: string,
  colors: { ink: string; muted: string } = { ink: INK, muted: MUTED }
) {
  if (logo) ctx.drawImage(logo, x, y, size, size);
  const cap = fitText(ctx, captionLine(info.storeName), maxW, 40, (px) => `900 ${px}px ${FONT}`, 1);
  ctx.textBaseline = "top";
  ctx.fillStyle = colors.ink;
  ctx.font = `900 ${cap.px}px ${FONT}`;
  ctx.fillText(cap.lines[0], textX, y + size / 2 - cap.px - 4);
  const sub = fitText(ctx, second, maxW, 26, (px) => `700 ${px}px ${FONT}`, 1);
  ctx.fillStyle = colors.muted;
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

/* ─── More templates (owner picked 1–6 from the canvas, 2026-11-21) ─────────── */

const MONO = "'Courier New', Courier, monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

function digitsFrom(seed: string, n: number): string {
  const v = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 10 ** n, 0);
  return String(v).padStart(n, "0");
}

/** Left- or right-aligned block, vertically centred in its band. */
function aligned(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, h: number, maxW: number, maxPx: number, font: FontFn, maxLines: number, color: string, align: CanvasTextAlign) {
  const fit = fitText(ctx, text, maxW, maxPx, font, maxLines, h);
  const lineH = fit.px * 1.12;
  let y = top + (h - fit.lines.length * lineH) / 2;
  ctx.font = font(fit.px);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  for (const line of fit.lines) {
    ctx.fillText(line, x, y);
    y += lineH;
  }
  ctx.textAlign = "start";
}

/** Three-letter "airport code": first letter, then the next consonants (Busog → BSG, Gutom → GTM). */
export function airportCode(place: string): string {
  const letters = place.toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return "BSG";
  const code = (letters[0] + letters.slice(1).replace(/[AEIOU]/g, "")).slice(0, 3);
  return (code + letters.slice(1)).slice(0, 3).padEnd(3, "X");
}

export function drawBoarding(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  ctx.fillStyle = "#0f3d5e";
  ctx.fillRect(0, 0, W, l.h);
  ctx.save();
  roundRect(ctx, 54, 54, W - 108, l.h - 108, 48);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(54, 54, W - 108, l.h - 108);
  ctx.fillStyle = RED;
  ctx.fillRect(54, 54, W - 108, 112);
  ctx.restore();

  aligned(ctx, "SHAREAT AIR", 96, 66, 88, 520, 46, (px) => `900 ${px}px ${FONT}`, 1, "#ffffff", "left");
  aligned(ctx, "BOARDING PASS", W - 96, 66, 88, 360, 30, (px) => `700 ${px}px ${MONO}`, 1, "#ffffff", "right");

  const to = (info.fields.to || "Busog City").trim();
  aligned(ctx, "FROM", 96, 188, 30, 200, 26, (px) => `700 ${px}px ${MONO}`, 1, MUTED, "left");
  aligned(ctx, "GTM", 96, 216, 104, 300, 100, (px) => `900 ${px}px ${FONT}`, 1, INK, "left");
  aligned(ctx, "Gutom", 96, 318, 40, 300, 32, (px) => `600 ${px}px ${FONT}`, 1, MUTED, "left");
  aligned(ctx, "TO", W - 96, 188, 30, 200, 26, (px) => `700 ${px}px ${MONO}`, 1, MUTED, "right");
  aligned(ctx, airportCode(to), W - 96, 216, 104, 300, 100, (px) => `900 ${px}px ${FONT}`, 1, INK, "right");
  aligned(ctx, to, W - 96, 318, 40, 380, 32, (px) => `600 ${px}px ${FONT}`, 1, MUTED, "right");
  ctx.strokeStyle = RED;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(470, 268);
  ctx.lineTo(610, 268);
  ctx.moveTo(585, 248);
  ctx.lineTo(610, 268);
  ctx.lineTo(585, 288);
  ctx.stroke();

  const slot = l.slots[0];
  ctx.save();
  roundRect(ctx, slot.x, slot.y, slot.w, slot.h, 24);
  ctx.clip();
  photo(ctx, shot, slot);
  ctx.restore();

  aligned(ctx, "PASSENGER", 96, 984, 30, 400, 26, (px) => `700 ${px}px ${MONO}`, 1, MUTED, "left");
  aligned(ctx, (info.fields.name || "Your Name").toUpperCase(), 96, 1014, 66, W - 192, 56, (px) => `900 ${px}px ${FONT}`, 1, INK, "left");
  const cols: [string, string][] = [
    ["FLIGHT", `SE ${digitsFrom(info.dateText, 4)}`],
    ["GATE", info.tableName || "-"],
    ["SEAT", "Unli"],
  ];
  cols.forEach(([label, value], i) => {
    const x = 96 + i * 300;
    aligned(ctx, label, x, 1096, 30, 280, 26, (px) => `700 ${px}px ${MONO}`, 1, MUTED, "left");
    aligned(ctx, value, x, 1126, 54, 280, 44, (px) => `900 ${px}px ${FONT}`, 1, INK, "left");
  });

  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = "#d4d4d8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(96, 1218);
  ctx.lineTo(W - 96, 1218);
  ctx.stroke();
  ctx.setLineDash([]);
  branding(ctx, logo, 96, 1252, 120, 236, 500, info, info.dateText);
  barcode(ctx, 764, 1266, 220, 92, `${info.storeName}|${info.dateText}|air`);
}

export function drawMagazine(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const slot = l.slots[0];
  ctx.fillStyle = "#a1a1aa";
  ctx.fillRect(0, 0, W, l.h);
  photo(ctx, shot, slot);
  // Darken the top and bottom of the photo so the cover type reads on any picture.
  const top = ctx.createLinearGradient(0, 0, 0, 420);
  top.addColorStop(0, "rgba(0,0,0,0.35)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 420);
  const bottom = ctx.createLinearGradient(0, 860, 0, slot.h);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 860, W, slot.h - 860);

  centred(ctx, "SHAREAT", W / 2, 14, 250, W - 60, 260, (px) => `900 ${px}px ${FONT}`, 1, RED);
  const issue = info.dateText.replace(/^(\w{3})\w*\s+\d+,\s*(\d{4})$/, "$1 $2").toUpperCase();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 12;
  aligned(ctx, "THE SAMGYUP ISSUE", 36, 262, 40, 600, 28, (px) => `900 ${px}px ${FONT}`, 1, "#ffffff", "left");
  aligned(ctx, issue, W - 36, 262, 40, 300, 28, (px) => `900 ${px}px ${FONT}`, 1, "#ffffff", "right");
  ["10 WAYS TO WRAP YOUR SSAM", "WHY RICE IS UNLIMITED", "GRILL LIKE A PRO"].forEach((line, i) => {
    aligned(ctx, line, 42, 400 + i * 120, 96, 380, 36, (px) => `900 ${px}px ${FONT}`, 2, "#ffffff", "left");
  });

  const headline = (info.fields.headline || "Grill Master of the Year").toUpperCase();
  const fit = fitText(ctx, headline, W - 84, 116, (px) => `900 ${px}px ${FONT}`, 3, 360);
  const lineH = fit.px * 1.05;
  let y = 1240 - fit.lines.length * lineH;
  ctx.font = `900 ${fit.px}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  for (const line of fit.lines) {
    ctx.fillText(line, 42, y);
    y += lineH;
  }
  aligned(ctx, (info.fields.name || "").toUpperCase(), 42, 1252, 56, W - 84, 44, (px) => `900 ${px}px ${FONT}`, 1, "#facc15", "left");
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // Price badge.
  ctx.save();
  ctx.translate(950, 440);
  ctx.rotate((10 * Math.PI) / 180);
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText("₱0", 0, -14);
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText("UNLIMITED", 0, 40);
  ctx.restore();
  ctx.textAlign = "start";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, slot.h, W, l.h - slot.h);
  branding(ctx, logo, 36, slot.h + 19, 100, 152, 660, info, info.dateText);
  barcode(ctx, 860, slot.h + 29, 184, 80, `${info.storeName}|${info.dateText}|mag`);
}

export function drawWanted(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const BROWN = "#3b2412";
  ctx.fillStyle = BROWN;
  ctx.fillRect(0, 0, W, l.h);
  ctx.fillStyle = "#ecd9b0";
  ctx.fillRect(42, 42, W - 84, l.h - 84);
  ctx.strokeStyle = "#7c4a1e";
  ctx.lineWidth = 9;
  ctx.strokeRect(64, 64, W - 128, l.h - 128);

  centred(ctx, "WANTED", W / 2, 84, 190, W - 200, 200, (px) => `900 ${px}px ${SERIF}`, 1, BROWN);
  centred(ctx, "FOR SERIOUS SAMGYUP CRIMES", W / 2, 278, 48, W - 220, 34, (px) => `700 ${px}px ${MONO}`, 1, BROWN);

  const slot = l.slots[0];
  ctx.fillStyle = BROWN;
  ctx.fillRect(slot.x - 12, slot.y - 12, slot.w + 24, slot.h + 24);
  ctx.save();
  // Old-photo look where the browser supports canvas filters; a plain photo elsewhere.
  ctx.filter = "sepia(0.85) contrast(1.05)";
  photo(ctx, shot, slot);
  ctx.restore();

  centred(ctx, (info.fields.name || "Your Name").toUpperCase(), W / 2, 948, 96, W - 200, 80, (px) => `900 ${px}px ${SERIF}`, 1, BROWN);
  const crime = (info.fields.crime || "").trim();
  if (crime) {
    const line = `For ${crime.charAt(0).toLowerCase()}${crime.slice(1)}`;
    centred(ctx, line, W / 2, 1050, 110, W - 240, 40, (px) => `700 ${px}px ${MONO}`, 2, BROWN);
  }
  centred(ctx, "REWARD", W / 2, 1172, 40, 400, 30, (px) => `700 ${px}px ${MONO}`, 1, BROWN);
  centred(ctx, "Unlimited Refills", W / 2, 1210, 80, W - 240, 66, (px) => `900 ${px}px ${SERIF}`, 1, BROWN);
  ctx.fillStyle = "#7c4a1e";
  ctx.fillRect(110, 1312, W - 220, 3);
  branding(ctx, logo, 110, 1330, 100, 228, W - 228 - 110, info, info.dateText, { ink: BROWN, muted: "#6b4a2a" });
}

export function drawCertificate(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const GOLD = "#b8860b";
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, W, l.h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, W - 72, l.h - 72);
  ctx.lineWidth = 3;
  ctx.strokeRect(58, 58, W - 116, l.h - 116);
  if (logo) ctx.drawImage(logo, 82, 82, 96, 96);

  centred(ctx, "SHAREAT ACADEMY OF GRILLING", W / 2, 96, 44, W - 320, 32, (px) => `700 ${px}px ${SERIF}`, 1, GOLD);
  centred(ctx, "Certificate", W / 2, 140, 112, W - 200, 104, (px) => `900 ${px}px ${SERIF}`, 1, INK);
  centred(ctx, "OF BUSOG", W / 2, 250, 60, 600, 46, (px) => `700 ${px}px ${SERIF}`, 1, INK);

  const slot = l.slots[0];
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, slot.w / 2, 0, Math.PI * 2);
  ctx.clip();
  photo(ctx, shot, slot);
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, slot.w / 2 + 6, 0, Math.PI * 2);
  ctx.stroke();

  centred(ctx, "PROUDLY PRESENTED TO", W / 2, 808, 40, 700, 28, (px) => `700 ${px}px ${FONT}`, 1, MUTED);
  centred(ctx, info.fields.name || "Your Name", W / 2, 850, 124, W - 180, 100, (px) => `italic 700 ${px}px ${SERIF}`, 1, INK);
  centred(ctx, (info.fields.award || "").toUpperCase(), W / 2, 980, 70, W - 220, 52, (px) => `900 ${px}px ${SERIF}`, 1, RED);

  // Signature, seal and date.
  centred(ctx, info.storeName, 275, 1270, 64, 330, 44, (px) => `italic 700 ${px}px ${SERIF}`, 1, INK);
  centred(ctx, info.dateText, 805, 1278, 56, 330, 36, (px) => `900 ${px}px ${FONT}`, 1, INK);
  ctx.fillStyle = INK;
  ctx.fillRect(110, 1340, 330, 3);
  ctx.fillRect(640, 1340, 330, 3);
  centred(ctx, "Branch", 275, 1348, 34, 300, 24, (px) => `600 ${px}px ${FONT}`, 1, MUTED);
  centred(ctx, "Date", 805, 1348, 34, 300, 24, (px) => `600 ${px}px ${FONT}`, 1, MUTED);
  ctx.fillStyle = "#d4a017";
  ctx.beginPath();
  ctx.arc(540, 1318, 82, 0, Math.PI * 2);
  ctx.fill();
  centred(ctx, "100%", 540, 1270, 50, 140, 40, (px) => `900 ${px}px ${SERIF}`, 1, "#fffaf0");
  centred(ctx, "BUSOG", 540, 1318, 40, 140, 28, (px) => `900 ${px}px ${SERIF}`, 1, "#fffaf0");
  centred(ctx, captionLine(info.storeName), W / 2, 1396, 44, W - 220, 30, (px) => `700 ${px}px ${FONT}`, 1, INK);
}

export function drawMovie(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const slot = l.slots[0];
  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, W, l.h);
  photo(ctx, shot, slot);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, "rgba(11,11,15,0.65)");
  top.addColorStop(1, "rgba(11,11,15,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 200);
  const fade = ctx.createLinearGradient(0, 640, 0, slot.h);
  fade.addColorStop(0, "rgba(11,11,15,0)");
  fade.addColorStop(1, "rgba(11,11,15,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 640, W, slot.h - 640);

  centred(ctx, `NOW SHOWING AT ${info.storeName.toUpperCase()}`, W / 2, 36, 48, W - 120, 30, (px) => `700 ${px}px ${FONT}`, 1, "#ffffff");
  centred(ctx, (info.fields.title || "The Last Round").toUpperCase(), W / 2, 860, 240, W - 80, 160, (px) => `900 ${px}px ${FONT}`, 2, "#fbbf24");
  const tagline = (info.fields.tagline || "").trim();
  if (tagline) centred(ctx, tagline, W / 2, 1106, 96, W - 140, 40, (px) => `400 ${px}px ${FONT}`, 2, "#ffffff");
  centred(ctx, "STARRING THE WHOLE TABLE · DIRECTED BY THE GRILL · MUSIC BY SIZZLE · PRODUCED BY SHAREAT", W / 2, 1222, 84, W - 120, 26, (px) => `600 ${px}px ${FONT}`, 2, "#a1a1aa");

  // The logo's black ring vanishes on the black poster, so it sits on a white disc.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(98, 1412, 54, 0, Math.PI * 2);
  ctx.fill();
  branding(ctx, logo, 48, 1362, 100, 164, 600, info, info.dateText, { ink: "#ffffff", muted: "#a1a1aa" });
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(792, 1388, 240, 52);
  centred(ctx, "RATED S FOR SARAP", 912, 1388, 52, 220, 24, (px) => `700 ${px}px ${FONT}`, 1, "#ffffff");
}

export function drawReceipt(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const left = 237;
  const right = 843;
  ctx.fillStyle = "#e7e5e4";
  ctx.fillRect(0, 0, W, l.h);
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(195, 42, 690, l.h - 84);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (logo) ctx.drawImage(logo, W / 2 - 50, 66, 100, 100);
  centred(ctx, info.storeName.toUpperCase(), W / 2, 176, 48, right - left, 38, (px) => `700 ${px}px ${MONO}`, 1, INK);
  centred(ctx, `${info.dateText}${info.tableName ? ` · ${info.tableName}` : ""}`, W / 2, 224, 38, right - left, 26, (px) => `700 ${px}px ${MONO}`, 1, INK);

  const slot = l.slots[0];
  ctx.save();
  ctx.filter = "grayscale(1) contrast(1.1)";
  photo(ctx, shot, slot);
  ctx.restore();

  centred(ctx, `CELEBRATING: ${(info.fields.celebrating || "").toUpperCase()}`, W / 2, 676, 80, right - left, 34, (px) => `700 ${px}px ${MONO}`, 2, INK);

  const dashed = (y: number) => {
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  dashed(776);
  [
    ["LAUGHS", "x ∞"],
    ["PORK BELLY", "x ∞"],
    ["KWENTUHAN", "x ∞"],
    ["STRESS", "x 0"],
  ].forEach(([item, qty], i) => {
    const y = 796 + i * 52;
    aligned(ctx, item, left, y, 44, 420, 32, (px) => `700 ${px}px ${MONO}`, 1, INK, "left");
    aligned(ctx, qty, right, y, 44, 160, 32, (px) => `700 ${px}px ${MONO}`, 1, INK, "right");
  });
  dashed(1014);
  aligned(ctx, "TOTAL", left, 1032, 64, 260, 52, (px) => `900 ${px}px ${MONO}`, 1, INK, "left");
  aligned(ctx, "PRICELESS", right, 1032, 64, 360, 52, (px) => `900 ${px}px ${MONO}`, 1, INK, "right");
  barcode(ctx, left, 1118, right - left, 90, `${info.storeName}|${info.dateText}|rcpt`);
  centred(ctx, captionLine(info.storeName), W / 2, 1226, 44, right - left, 30, (px) => `700 ${px}px ${MONO}`, 1, INK);
  centred(ctx, "Salamat po! Balik kayo!", W / 2, 1276, 40, right - left, 28, (px) => `700 ${px}px ${MONO}`, 1, INK);
  centred(ctx, `No. ${digitsFrom(`${info.storeName}|${info.dateText}`, 6)}`, W / 2, 1324, 36, right - left, 24, (px) => `700 ${px}px ${MONO}`, 1, MUTED);
}

/**
 * Now Playing: a music-player screen. Thermal-safe by design (owner's call):
 * black lines and text on white, a black-and-white cover, no large solid
 * black areas — dark fills smudge and fade on thermal paper.
 */
export function drawNowPlaying(ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) {
  const W = l.w;
  const K = "#111111";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, l.h);
  ctx.strokeStyle = K;
  ctx.fillStyle = K;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Header: chevron, "PLAYING FROM <branch>", menu dots.
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(72, 80);
  ctx.lineTo(96, 104);
  ctx.lineTo(120, 80);
  ctx.stroke();
  for (const dx of [-26, 0, 26]) {
    ctx.beginPath();
    ctx.arc(W - 96 + dx, 92, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  centred(ctx, "PLAYING FROM", W / 2, 50, 34, 500, 24, (px) => `700 ${px}px ${FONT}`, 1, K);
  centred(ctx, info.storeName, W / 2, 84, 46, 640, 36, (px) => `900 ${px}px ${FONT}`, 1, K);

  // Cover: the guest's photo, black and white, with a thin frame.
  const slot = l.slots[0];
  ctx.save();
  ctx.filter = "grayscale(1) contrast(1.1)";
  photo(ctx, shot, slot);
  ctx.restore();
  ctx.lineWidth = 5;
  ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);

  // Title, artist and the (outlined) heart.
  aligned(ctx, info.fields.song || "Busog Na Busog", 66, 1132, 76, 820, 64, (px) => `900 ${px}px ${FONT}`, 1, K, "left");
  aligned(ctx, info.fields.artist || "", 66, 1210, 48, 820, 36, (px) => `600 ${px}px ${FONT}`, 1, K, "left");
  ctx.save();
  ctx.translate(970, 1180);
  ctx.scale(2.6, 2.6);
  ctx.translate(-12, -12);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(12, 20);
  ctx.bezierCurveTo(12, 20, 5, 15.7, 3, 11.4);
  ctx.bezierCurveTo(1.7, 8.4, 3.6, 5, 7, 5);
  ctx.bezierCurveTo(9, 5, 10.4, 6.1, 12, 8);
  ctx.bezierCurveTo(13.6, 6.1, 15, 5, 17, 5);
  ctx.bezierCurveTo(20.4, 5, 22.3, 8.4, 21, 11.4);
  ctx.bezierCurveTo(19, 15.7, 12, 20, 12, 20);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Progress bar: outlined track, black filled part, white knob.
  const barX = 66;
  const barW = W - 132;
  const barY = 1296;
  ctx.lineWidth = 4;
  roundRect(ctx, barX, barY, barW, 18, 9);
  ctx.stroke();
  roundRect(ctx, barX, barY, barW * 0.62, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(barX + barW * 0.62, barY + 9, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = K;
  aligned(ctx, "2:26", barX, 1330, 36, 200, 28, (px) => `700 ${px}px ${FONT}`, 1, K, "left");
  aligned(ctx, "4:00", barX + barW, 1330, 36, 200, 28, (px) => `700 ${px}px ${FONT}`, 1, K, "right");

  // Controls: shuffle, previous, pause (outlined ring), next, repeat.
  const cy = 1450;
  ctx.lineWidth = 7;
  // shuffle
  ctx.beginPath();
  ctx.moveTo(70, cy - 26); ctx.lineTo(96, cy - 26); ctx.bezierCurveTo(130, cy - 26, 140, cy + 26, 174, cy + 26); ctx.lineTo(190, cy + 26);
  ctx.moveTo(70, cy + 26); ctx.lineTo(96, cy + 26); ctx.bezierCurveTo(130, cy + 26, 140, cy - 26, 174, cy - 26); ctx.lineTo(190, cy - 26);
  ctx.moveTo(176, cy - 40); ctx.lineTo(192, cy - 26); ctx.lineTo(176, cy - 12);
  ctx.moveTo(176, cy + 12); ctx.lineTo(192, cy + 26); ctx.lineTo(176, cy + 40);
  ctx.stroke();
  // previous
  ctx.beginPath();
  ctx.moveTo(300, cy - 34); ctx.lineTo(300, cy + 34);
  ctx.moveTo(372, cy - 34); ctx.lineTo(318, cy); ctx.lineTo(372, cy + 34); ctx.closePath();
  ctx.stroke();
  // pause in a ring
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(W / 2, cy, 80, 0, Math.PI * 2);
  ctx.stroke();
  roundRect(ctx, W / 2 - 30, cy - 38, 20, 76, 5);
  ctx.fill();
  roundRect(ctx, W / 2 + 10, cy - 38, 20, 76, 5);
  ctx.fill();
  // next
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(780, cy - 34); ctx.lineTo(780, cy + 34);
  ctx.moveTo(708, cy - 34); ctx.lineTo(762, cy); ctx.lineTo(708, cy + 34); ctx.closePath();
  ctx.stroke();
  // repeat
  ctx.beginPath();
  ctx.moveTo(890, cy + 2); ctx.lineTo(890, cy - 10); ctx.arcTo(890, cy - 30, 910, cy - 30, 20); ctx.lineTo(1004, cy - 30);
  ctx.moveTo(990, cy - 44); ctx.lineTo(1006, cy - 30); ctx.lineTo(990, cy - 16);
  ctx.moveTo(1010, cy - 2); ctx.lineTo(1010, cy + 10); ctx.arcTo(1010, cy + 30, 990, cy + 30, 20); ctx.lineTo(896, cy + 30);
  ctx.moveTo(910, cy + 16); ctx.lineTo(894, cy + 30); ctx.lineTo(910, cy + 44);
  ctx.stroke();

  // Headphones: "Listening on <table>".
  const hy = 1580;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(96, hy, 26, Math.PI, 0);
  ctx.stroke();
  roundRect(ctx, 66, hy - 4, 16, 26, 4);
  ctx.stroke();
  roundRect(ctx, 110, hy - 4, 16, 26, 4);
  ctx.stroke();
  aligned(ctx, `LISTENING ON ${(info.tableName || "YOUR TABLE").toUpperCase()}`, 146, hy - 22, 48, 760, 32, (px) => `900 ${px}px ${FONT}`, 1, K, "left");

  // Branding under a dashed rule.
  ctx.setLineDash([16, 12]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(66, 1630);
  ctx.lineTo(W - 66, 1630);
  ctx.stroke();
  ctx.setLineDash([]);
  branding(ctx, logo, 66, 1656, 84, 170, W - 170 - 66, info, info.dateText, { ink: K, muted: "#333333" });
}

type Drawer = (ctx: CanvasRenderingContext2D, l: Layout, shot: HTMLCanvasElement | undefined, info: TemplateInfo, logo: HTMLImageElement | null) => void;

export const DRAWERS: Record<NonNullable<Layout["template"]>, Drawer> = {
  ticket: drawTicket,
  idcard: drawIdCard,
  boarding: drawBoarding,
  magazine: drawMagazine,
  wanted: drawWanted,
  certificate: drawCertificate,
  movie: drawMovie,
  receipt: drawReceipt,
  nowplaying: drawNowPlaying,
};
