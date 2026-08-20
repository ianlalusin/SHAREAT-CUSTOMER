import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  REFILL_COOLDOWN_MS,
  blockedRefills,
  formatCountdown,
  type CooldownMap,
} from "../refill-cooldown";

/**
 * Server-side claim/release of per-meat refill cooldowns.
 *
 * State lives in a `refillCooldowns` map on the participant doc — the same doc
 * validateActiveParticipant() already reads — so per-meat timers cost no extra
 * reads or writes over a single global timer would have.
 */

export type ClaimedCooldowns = {
  refillIds: string[];
  /** Prior stamps, for rollback. 0 means "had never been ordered". */
  previous: CooldownMap;
  claimedAtMs: number;
};

export type BlockedRefill = {
  refillId: string;
  refillName: string;
  nextAllowedAtMs: number;
  retryAfterMs: number;
};

function participantDoc(db: Firestore, storeId: string, sessionId: string, participantId: string) {
  return db.doc(
    `stores/${storeId}/activeSessions/${sessionId}/customerParticipants/${participantId}`
  );
}

export function readCooldownMap(data: Record<string, any> | undefined): CooldownMap {
  const raw = data?.refillCooldowns;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as CooldownMap) : {};
}

function describeBlocked(blocked: BlockedRefill[]): string {
  if (blocked.length === 1) {
    const b = blocked[0];
    return `${b.refillName} is still cooling down — ${formatCountdown(b.retryAfterMs)} left. You can order your other refills now.`;
  }
  const list = blocked
    .map((b) => `${b.refillName} (${formatCountdown(b.retryAfterMs)})`)
    .join(", ");
  return `These are still cooling down: ${list}. You can order your other refills now.`;
}

/**
 * Atomically claims the cooldown slot for every requested refill type.
 *
 * All-or-nothing: if any requested refill is still cooling down the whole order
 * is rejected with httpStatus 429, rather than silently sending part of it. The
 * UI keeps cooling refills unselectable, so this is the safety net behind it.
 *
 * Being a single-doc transaction, this also makes double-submit impossible —
 * two rapid taps cannot both claim the same slot.
 */
export async function claimRefillCooldowns(
  db: Firestore,
  opts: {
    storeId: string;
    sessionId: string;
    participantId: string;
    refillIds: string[];
    /** refillId -> display name, used only for the error message. */
    labels?: Record<string, string>;
    cooldownMs?: number;
  }
): Promise<ClaimedCooldowns> {
  const { storeId, sessionId, participantId, labels = {} } = opts;
  const cooldownMs = opts.cooldownMs ?? REFILL_COOLDOWN_MS;

  const refillIds = Array.from(new Set(opts.refillIds.filter(Boolean)));
  if (!refillIds.length) {
    return { refillIds: [], previous: {}, claimedAtMs: Date.now() };
  }

  const ref = participantDoc(db, storeId, sessionId, participantId);

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw Object.assign(new Error("Participant not found."), { httpStatus: 403 });
    }

    const current = readCooldownMap(snap.data());
    const nowMs = Date.now();

    const blocked: BlockedRefill[] = blockedRefills(current, refillIds, nowMs, cooldownMs).map(
      (b) => ({
        refillId: b.refillId,
        refillName: labels[b.refillId] || b.refillId,
        nextAllowedAtMs: b.nextAllowedAtMs,
        retryAfterMs: Math.max(0, b.nextAllowedAtMs - nowMs),
      })
    );

    if (blocked.length) {
      throw Object.assign(new Error(describeBlocked(blocked)), { httpStatus: 429, blocked });
    }

    const previous: CooldownMap = {};
    const next: CooldownMap = { ...current };
    for (const refillId of refillIds) {
      previous[refillId] = Number(current[refillId]) || 0;
      next[refillId] = nowMs;
    }

    // Whole-map write rather than dotted "refillCooldowns.<id>" keys: refill ids
    // are arbitrary doc ids, and the map was read in this same transaction.
    tx.set(ref, { refillCooldowns: next }, { merge: true });

    return { refillIds, previous, claimedAtMs: nowMs };
  });
}

/**
 * Puts the previous stamps back when ticket creation fails after a successful
 * claim — a failed order must not cost the guest 10 minutes.
 */
export async function releaseRefillCooldowns(
  db: Firestore,
  opts: { storeId: string; sessionId: string; participantId: string; claimed: ClaimedCooldowns }
): Promise<void> {
  const { storeId, sessionId, participantId, claimed } = opts;
  if (!claimed.refillIds.length) return;

  const ref = participantDoc(db, storeId, sessionId, participantId);

  try {
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const current = readCooldownMap(snap.data());
      const next: CooldownMap = { ...current };

      for (const refillId of claimed.refillIds) {
        // Only roll back our own claim; a newer claim by another request wins.
        if (Number(current[refillId]) === claimed.claimedAtMs) {
          next[refillId] = Number(claimed.previous[refillId]) || 0;
        }
      }

      tx.set(ref, { refillCooldowns: next }, { merge: true });
    });
  } catch {
    // Best-effort: the order already failed, so surface that error, not this one.
  }
}
