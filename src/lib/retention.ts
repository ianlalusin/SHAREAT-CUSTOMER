/**
 * Which loyalty cards the privacy notice says must go — as pure functions, so
 * the rule that deletes customer data is pinned by tests before it ever runs.
 *
 * The notice (app/privacy, lib/privacy.ts) promises: a card unused for
 * RETENTION_YEARS_AFTER_LAST_VISIT years is deleted with its personal details
 * and remaining points. "Used" is read generously — keeping a card a little
 * longer is the safe mistake, deleting an active one is not:
 *
 *   - a visit: POS stamps `storeVisits.{storeId}.lastVisitAtMs` on every earn
 *     (since 2026-04-13; older visits carry no date, hence the next two),
 *   - creation: `createdAt`,
 *   - any change to the card: `updatedAt` — earn, redeem, transfer in or out,
 *     profile edit, voucher.
 *
 * Never deleted, whatever the dates say:
 *   - a card with points held for an unredeemed voucher (`pointsReserved`):
 *     a voucher is a promise the branch has not settled yet;
 *   - a card with no date at all to judge by: nothing proves it is inactive.
 */

export type RetentionDecision =
  | { action: "delete"; lastActivityMs: number }
  | { action: "keep"; lastActivityMs: number }
  | { action: "skip"; reason: "voucher-held" | "no-date"; lastActivityMs: number | null };

/** A Firestore Timestamp, a plain millis number, or anything else (→ null). */
export function toMillis(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  const anyV = v as any;
  if (anyV && typeof anyV.toMillis === "function") {
    const ms = Number(anyV.toMillis());
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (anyV && typeof anyV._seconds === "number") return anyV._seconds * 1000;
  return null;
}

/** The latest sign of life on a card, or null when it carries no date at all. */
export function lastActivityMs(customer: Record<string, any>): number | null {
  const dates: number[] = [];
  const visits = customer?.storeVisits;
  if (visits && typeof visits === "object") {
    for (const v of Object.values(visits)) {
      const ms = toMillis((v as any)?.lastVisitAtMs);
      if (ms) dates.push(ms);
    }
  }
  for (const f of ["createdAt", "updatedAt"]) {
    const ms = toMillis(customer?.[f]);
    if (ms) dates.push(ms);
  }
  return dates.length ? Math.max(...dates) : null;
}

/** The same calendar instant `years` years earlier (29 Feb rolls to 1 Mar). */
export function retentionCutoffMs(nowMs: number, years: number): number {
  const d = new Date(nowMs);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
}

export function retentionDecision(customer: Record<string, any>, nowMs: number, years: number): RetentionDecision {
  const last = lastActivityMs(customer);
  if (Number(customer?.pointsReserved || 0) > 0) return { action: "skip", reason: "voucher-held", lastActivityMs: last };
  if (last === null) return { action: "skip", reason: "no-date", lastActivityMs: null };
  return last < retentionCutoffMs(nowMs, years)
    ? { action: "delete", lastActivityMs: last }
    : { action: "keep", lastActivityMs: last };
}

/** The Manila calendar day an instant falls on, as the log projection keys it: YYYYMMDD. */
export function manilaDayId(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * A daily log projection's entries with this person taken out of them: phone
 * and name blanked, everything else (points, store, time) kept so the day's
 * totals still add up. Returns null when nothing in the list was theirs.
 */
export function redactEntries<T extends { phone?: unknown; customerName?: unknown }>(
  entries: T[],
  phone: string
): T[] | null {
  let changed = false;
  const out = entries.map((e) => {
    if (e?.phone !== phone) return e;
    changed = true;
    return { ...e, phone: null, customerName: "", redacted: true };
  });
  return changed ? out : null;
}

/** For reports: enough to recognise a number, not enough to call it. */
export function maskPhone(phone: string): string {
  const s = String(phone || "");
  return s.length <= 4 ? "****" : `${"*".repeat(Math.max(0, s.length - 3))}${s.slice(-3)}`;
}
