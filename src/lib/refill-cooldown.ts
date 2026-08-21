/**
 * Refill cooldown rules — pure, isomorphic, no Firestore.
 *
 * A refill type is blocked for a guest while EITHER holds:
 *
 *   1. their last order of it was under REFILL_COOLDOWN_MS ago, or
 *   2. their last ticket for it is still in the kitchen — not yet served or
 *      cancelled.
 *
 * ...whichever lasts longer. The clocks are independent per meat AND per phone:
 * ordering Pork locks only Pork, and only for that participant, so the other
 * guests at the table and that guest's other meats are unaffected.
 *
 * Rule (2) is what the old 10-minute timer was really approximating. Gating on
 * whether the food actually arrived measures the thing itself, so the timer
 * only has to stop a double-tap now — hence one minute.
 *
 * Kept free of firebase-admin so both the API routes and the client bundle can
 * import it and agree on the arithmetic. The Firestore side lives in
 * lib/server/refill-cooldown.ts; resolving "still in the kitchen" needs
 * Firestore and lives in lib/server/refill-outstanding.ts.
 */

export const REFILL_COOLDOWN_MS = 60 * 1000;

/**
 * How long an unserved ticket may keep blocking its refill.
 *
 * THE SAFETY VALVE. Without it, a ticket the kitchen never marks served or
 * cancelled would lock that meat for that phone forever, with no fix but staff
 * intervention — and tickets do get stuck (the KDS carries a `printedOffline`
 * auto-acknowledge path precisely because of it). Capping the block at the old
 * cooldown makes yesterday's behaviour the WORST case rather than the default.
 */
export const OUTSTANDING_BLOCK_MAX_MS = 10 * 60 * 1000;

/** Why a refill is unavailable. The UI must say these differently. */
export type BlockReason = "cooldown" | "in_kitchen";

export type BlockedRefill = {
  refillId: string;
  reason: BlockReason;
  /** 0 for "in_kitchen" — there is no known arrival time, so never show a timer. */
  nextAllowedAtMs: number;
};

/** refillId -> epoch ms of that refill's last order, as stored on the participant doc. */
export type CooldownMap = Record<string, number>;

export type CooldownState = {
  allowed: boolean;
  retryAfterMs: number;
  /** 0 when the refill has never been ordered. */
  nextAllowedAtMs: number;
};

function lastOrderAt(map: CooldownMap | null | undefined, refillId: string): number {
  const raw = Number(map?.[refillId]);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** Cooldown state for one refill type. An absent/garbage stamp means "never ordered". */
export function cooldownFor(
  map: CooldownMap | null | undefined,
  refillId: string,
  nowMs: number,
  cooldownMs: number = REFILL_COOLDOWN_MS
): CooldownState {
  const last = lastOrderAt(map, refillId);
  if (!last) return { allowed: true, retryAfterMs: 0, nextAllowedAtMs: 0 };

  const nextAllowedAtMs = last + cooldownMs;
  const retryAfterMs = Math.max(0, nextAllowedAtMs - nowMs);
  return { allowed: retryAfterMs <= 0, retryAfterMs, nextAllowedAtMs };
}

/**
 * Which of the requested refill types are unavailable, and why.
 *
 * "in_kitchen" is reported ahead of "cooldown": when both apply, the honest
 * message is that the food has not arrived, and it is the one with no
 * predictable end — showing a 20-second countdown next to a refill that will
 * not unlock until the kitchen serves would be a lie.
 */
export function blockedRefillsDetailed(
  map: CooldownMap | null | undefined,
  outstanding: ReadonlySet<string> | null | undefined,
  refillIds: string[],
  nowMs: number,
  cooldownMs: number = REFILL_COOLDOWN_MS
): BlockedRefill[] {
  const seen = new Set<string>();
  const blocked: BlockedRefill[] = [];

  for (const refillId of refillIds) {
    if (!refillId || seen.has(refillId)) continue;
    seen.add(refillId);

    if (outstanding?.has(refillId)) {
      blocked.push({ refillId, reason: "in_kitchen", nextAllowedAtMs: 0 });
      continue;
    }

    const state = cooldownFor(map, refillId, nowMs, cooldownMs);
    if (!state.allowed) {
      blocked.push({ refillId, reason: "cooldown", nextAllowedAtMs: state.nextAllowedAtMs });
    }
  }

  return blocked;
}

/** Which of the requested refill types are still cooling down. Empty = the order may proceed. */
export function blockedRefills(
  map: CooldownMap | null | undefined,
  refillIds: string[],
  nowMs: number,
  cooldownMs: number = REFILL_COOLDOWN_MS
): Array<{ refillId: string; nextAllowedAtMs: number }> {
  const seen = new Set<string>();
  const blocked: Array<{ refillId: string; nextAllowedAtMs: number }> = [];

  for (const refillId of refillIds) {
    if (!refillId || seen.has(refillId)) continue;
    seen.add(refillId);

    const state = cooldownFor(map, refillId, nowMs, cooldownMs);
    if (!state.allowed) blocked.push({ refillId, nextAllowedAtMs: state.nextAllowedAtMs });
  }

  return blocked;
}

/**
 * The client-facing projection: refillId -> when it unlocks. Entries whose
 * cooldown has already lapsed are dropped so the UI never renders a dead 0:00.
 */
export function toNextAllowedMap(
  map: CooldownMap | null | undefined,
  nowMs: number,
  cooldownMs: number = REFILL_COOLDOWN_MS
): Record<string, number> {
  const out: Record<string, number> = {};

  for (const refillId of Object.keys(map || {})) {
    const state = cooldownFor(map, refillId, nowMs, cooldownMs);
    if (!state.allowed) out[refillId] = state.nextAllowedAtMs;
  }

  return out;
}

/** Remaining ms as m:ss. Rounds up, so a blocked refill never reads 0:00. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
