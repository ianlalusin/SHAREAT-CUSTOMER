/**
 * Whether a table may ask for another griller from the app.
 *
 * Each table gets one stove per 4 guests, rounded up (5 guests already have 2).
 * So only a table sitting exactly on a 4-guest boundary (4, 8) is running at
 * full stove load and may want one more; from 12 guests up, tables are big
 * enough that an extra is always worth offering. Owner's rule, 2026-11-21.
 */
export function canRequestGriller(guestCount: number): boolean {
  const g = Math.floor(Number(guestCount) || 0);
  return g === 4 || g === 8 || g >= 12;
}
