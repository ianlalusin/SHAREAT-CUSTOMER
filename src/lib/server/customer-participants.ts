import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";

export interface ParticipantSlot {
  participantId: string;
  slotNumber: number;
  claimedByUid: string;
  joinMethod: "qr" | "pin";
  isNew: boolean;
}

export function hashDeviceId(rawDeviceId: string): string {
  return createHash("sha256").update(rawDeviceId).digest("hex").slice(0, 16);
}

/**
 * Claims or reuses a participant slot for a connected device.
 *
 * Uses deviceIdHash as the Firestore doc ID when available so the same device
 * always maps to the same doc within a session — enabling idempotent joins
 * inside a single Firestore transaction (no unbounded queries needed).
 */
export async function claimOrReuseParticipantSlot(
  db: Firestore,
  opts: {
    storeId: string;
    sessionId: string;
    deviceIdHash: string | null;
    joinMethod: "qr" | "pin";
    pinSnapshot: string | null;
    customerNameSnapshot: string | null;
    tableDisplayNameSnapshot: string | null;
  }
): Promise<ParticipantSlot> {
  const {
    storeId, sessionId, deviceIdHash, joinMethod, pinSnapshot,
    customerNameSnapshot, tableDisplayNameSnapshot,
  } = opts;

  const participantsRef = db.collection(
    `stores/${storeId}/activeSessions/${sessionId}/customerParticipants`
  );
  const sessionRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  const nowMs = Date.now();
  const participantDocId = deviceIdHash ?? participantsRef.doc().id;
  const participantRef = participantsRef.doc(participantDocId);

  return db.runTransaction(async (tx) => {
    const [participantSnap, sessionSnap] = await Promise.all([
      tx.get(participantRef),
      tx.get(sessionRef),
    ]);

    if (!sessionSnap.exists) {
      throw Object.assign(new Error("Session not found."), { httpStatus: 404 });
    }

    if (participantSnap.exists && participantSnap.data()?.status === "active") {
      const existing = participantSnap.data() as Record<string, any>;
      tx.update(participantRef, {
        lastSeenAt: FieldValue.serverTimestamp(),
        lastSeenAtMs: nowMs,
      });
      return {
        participantId: participantDocId,
        slotNumber: Number(existing.slotNumber),
        claimedByUid: String(existing.claimedByUid),
        joinMethod: existing.joinMethod as "qr" | "pin",
        isNew: false,
      };
    }

    const sessionData = sessionSnap.data() as Record<string, any>;
    const activeCount = Number(sessionData.customerParticipantActiveCount || 0);
    const limit = Number(sessionData.customerParticipantLimit || 1);

    if (activeCount >= limit) {
      throw Object.assign(
        new Error("Session is full. Maximum participants reached."),
        { httpStatus: 403 }
      );
    }

    // slotNumber is derived from the transaction snapshot of activeCount.
    // Firestore serializes transactions — if sessionRef changes between this read
    // and commit (concurrent join), this transaction retries with the updated count,
    // so slotNumbers are unique across concurrent joins.
    const slotNumber = activeCount + 1;
    const claimedByUid = `cust_part_${participantDocId}`;

    tx.set(participantRef, {
      participantId: participantDocId,
      storeId,
      sessionId,
      slotNumber,
      status: "active",
      joinedAt: FieldValue.serverTimestamp(),
      joinedAtMs: nowMs,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenAtMs: nowMs,
      claimedByUid,
      deviceIdHash: deviceIdHash ?? null,
      joinMethod,
      pinSnapshot: pinSnapshot ?? null,
      customerNameSnapshot: customerNameSnapshot ?? null,
      tableDisplayNameSnapshot: tableDisplayNameSnapshot ?? null,
      linkedCustomerPhone: null,
    });

    tx.update(sessionRef, {
      customerParticipantActiveCount: FieldValue.increment(1),
    });

    return { participantId: participantDocId, slotNumber, claimedByUid, joinMethod, isNew: true };
  });
}

export async function validateActiveParticipant(
  db: Firestore,
  storeId: string,
  sessionId: string,
  participantId: string
): Promise<{ slotNumber: number; joinMethod: string }> {
  const snap = await db
    .doc(`stores/${storeId}/activeSessions/${sessionId}/customerParticipants/${participantId}`)
    .get();
  if (!snap.exists) {
    throw Object.assign(new Error("Participant not found."), { httpStatus: 403 });
  }
  const data = snap.data() as Record<string, any>;
  if (data.status !== "active") {
    throw Object.assign(new Error("Participant access has been removed."), { httpStatus: 403 });
  }
  return { slotNumber: Number(data.slotNumber), joinMethod: String(data.joinMethod || "pin") };
}

export async function endAllParticipants(
  db: Firestore,
  storeId: string,
  sessionId: string,
  status: "revoked" | "ended",
  byUid: string,
  reason: string
): Promise<number> {
  const ref = db.collection(
    `stores/${storeId}/activeSessions/${sessionId}/customerParticipants`
  );
  const snap = await ref.where("status", "==", "active").get();
  if (snap.empty) return 0;

  const sessionRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  const batch = db.batch();
  const nowTs = FieldValue.serverTimestamp();
  for (const d of snap.docs) {
    batch.update(d.ref, { status, revokedAt: nowTs, revokedByUid: byUid, revokeReason: reason });
  }
  batch.update(sessionRef, { customerParticipantActiveCount: 0 });
  await batch.commit();
  return snap.size;
}
