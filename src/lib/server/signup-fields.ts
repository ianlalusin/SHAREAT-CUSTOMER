/**
 * Pure field checks shared by both signup paths (standalone + in-session).
 */

/**
 * Today's calendar date in Manila, as YYYY-MM-DD. Branches are in the
 * Philippines, so "born in the future" is judged on the diner's clock, not the
 * server's.
 */
function manilaToday(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(nowMs));
}

/**
 * A birthday is a calendar date, not an instant. The old check parsed
 * `bday + "T00:00:00"` as LOCAL midnight and compared its UTC date back to the
 * input — on a Manila-time server that is the previous day, so every valid
 * birthday was rejected. Here the parts are checked through UTC components
 * only, so the server's timezone never enters into it.
 *
 * Returns an error message, or null when valid.
 */
export function birthdayError(bday: string, nowMs = Date.now()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bday);
  if (!m) return "Birthday must be YYYY-MM-DD.";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Date.UTC rolls 2001-02-30 over to March 2; a round-trip mismatch means the
  // day does not exist.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return "Invalid date.";
  }
  if (y < 1900 || bday > manilaToday(nowMs)) return "Invalid date.";
  return null;
}
