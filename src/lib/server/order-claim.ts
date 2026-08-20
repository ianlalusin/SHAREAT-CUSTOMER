import type { Firestore, Transaction } from "firebase-admin/firestore";

/**
 * One-shot claim of a client-generated order id, so a double tap cannot place
 * the same order twice.
 *
 * Refills get this for free — their per-meat cooldown is itself a single-doc
 * transaction, so two rapid taps cannot both claim the slot. Add-on orders have
 * no cooldown (ordering two Kimbaps in a row is legitimate), so they need an
 * explicit guard, built the same way: a map on the participant doc, claimed
 * inside a transaction.
 *
 * The client sends the same `clientRequestId` for every retry of one submission.
 * The first request through wins; a duplicate is rejected rather than silently
 * ignored, so the caller can answer "already sent" instead of double-charging.
 */

/** How long a claimed id is remembered. Comfortably longer than any retry. */
export const ORDER_CLAIM_TTL_MS = 10 * 60 * 1000;

/** Bounds the map so a long session cannot grow the participant doc without limit. */
const MAX_RETAINED_CLAIMS = 40;

type ClaimMap = Record<string, number>;

function participantDoc(db: Firestore, storeId: string, sessionId: string, participantId: string) {
  return db.doc(`stores/${storeId}/activeSessions/${sessionId}/customerParticipants/${participantId}`);
}

function readClaims(data: Record<string, any> | undefined): ClaimMap {
  const raw = data?.orderClaims;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as ClaimMap) : {};
}

/** Drops expired entries, then the oldest, until the map is bounded. */
function prune(claims: ClaimMap, nowMs: number): ClaimMap {
  const live = Object.entries(claims).filter(([, at]) => nowMs - Number(at || 0) < ORDER_CLAIM_TTL_MS);
  live.sort((a, b) => Number(b[1]) - Number(a[1]));
  return Object.fromEntries(live.slice(0, MAX_RETAINED_CLAIMS - 1));
}

/**
 * Claims `clientRequestId`, or throws `httpStatus: 409` if it was already used.
 *
 * Being a single-doc transaction, two concurrent requests carrying the same id
 * cannot both succeed.
 */
export async function claimOrderRequest(
  db: Firestore,
  opts: { storeId: string; sessionId: string; participantId: string; clientRequestId: string }
): Promise<void> {
  const { storeId, sessionId, participantId, clientRequestId } = opts;
  if (!clientRequestId) {
    throw Object.assign(new Error("Missing clientRequestId."), { httpStatus: 400 });
  }

  const ref = participantDoc(db, storeId, sessionId, participantId);

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw Object.assign(new Error("Participant not found."), { httpStatus: 403 });
    }

    const nowMs = Date.now();
    const current = readClaims(snap.data());
    const claimedAt = Number(current[clientRequestId] || 0);

    if (claimedAt && nowMs - claimedAt < ORDER_CLAIM_TTL_MS) {
      throw Object.assign(new Error("That order was already sent."), { httpStatus: 409 });
    }

    const next = prune(current, nowMs);
    next[clientRequestId] = nowMs;

    // Whole-map write rather than a dotted key: ids are client-supplied, and the
    // map was read in this same transaction.
    tx.set(ref, { orderClaims: next }, { merge: true });
  });
}

/**
 * Releases a claim when the order failed after claiming it, so the diner can
 * simply tap again instead of being told their failed order "was already sent".
 */
export async function releaseOrderRequest(
  db: Firestore,
  opts: { storeId: string; sessionId: string; participantId: string; clientRequestId: string }
): Promise<void> {
  const { storeId, sessionId, participantId, clientRequestId } = opts;
  if (!clientRequestId) return;

  const ref = participantDoc(db, storeId, sessionId, participantId);
  try {
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = readClaims(snap.data());
      if (!(clientRequestId in current)) return;
      const next = { ...current };
      delete next[clientRequestId];
      tx.set(ref, { orderClaims: next }, { merge: true });
    });
  } catch {
    // Best-effort: the order already failed, so surface that error, not this one.
  }
}
