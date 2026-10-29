/**
 * Fitting the caption burned into a ghost photo.
 *
 * The caption used to be one line at a fixed size, so "I caught Coca-Boo and
 * won 1 serving Enoki Rolls!" ran off the photo's edge — the prize, the part
 * the cashier and the diner's friends need to read, was the part cut off.
 * Now the size steps down until the text fits, wrapping to two lines if it
 * has to; only a pathological string is ever cut, and then with an ellipsis.
 *
 * `measure(text, px)` is the width of text at a font size — canvas
 * measureText in the app, a stub in tests.
 */

export type Measure = (text: string, px: number) => number;

/** Greedy word wrap into at most `maxLines` lines no wider than `maxW`. Null when it does not fit. */
export function wrapToWidth(measure: Measure, text: string, px: number, maxW: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, px) <= maxW) {
      cur = next;
      continue;
    }
    if (!cur || measure(w, px) > maxW) return null; // a single word wider than the line
    lines.push(cur);
    cur = w;
    if (lines.length >= maxLines) return null;
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/**
 * The largest size from `sizes` (largest first) at which the text fits in one
 * line, else in two. Falls back to the smallest size, two lines, the second
 * cut with "…" — never past the edge.
 */
export function fitCaption(measure: Measure, text: string, maxW: number, sizes: number[]): { px: number; lines: string[] } {
  for (const lines of [1, 2]) {
    for (const px of sizes) {
      const fit = wrapToWidth(measure, text, px, maxW, lines);
      if (fit) return { px, lines: fit };
    }
  }
  const px = sizes[sizes.length - 1];
  const words = text.split(/\s+/).filter(Boolean);
  let first = "";
  let i = 0;
  while (i < words.length && measure(first ? `${first} ${words[i]}` : words[i], px) <= maxW) {
    first = first ? `${first} ${words[i]}` : words[i];
    i++;
  }
  let second = words.slice(i).join(" ");
  while (second && measure(`${second}…`, px) > maxW) second = second.slice(0, -1);
  return { px, lines: [first, `${second}…`].filter((l) => l !== "…") };
}
