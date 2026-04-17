import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Daily projection cap per doc. Each entry ~300-400 bytes including
 * metadata; 500 × 400 ≈ 200KB — comfortably under the 1 MiB Firestore
 * doc limit. Rolls over to a new part when exceeded.
 */
const MAX_ENTRIES_PER_PART = 500;

export type LoyaltyLogType =
  | "account_created"
  | "points_earned"
  | "points_transferred"
  | "password_reset"
  | "login"
  | "login_failed";

export type LoyaltyLogInput = {
  type: LoyaltyLogType;
  phone: string;
  customerName: string;
  actorUid: string;
  source?: string;
  storeId?: string;
  storeName?: string;
  sessionId?: string;
  points?: number;
  amount?: number;
};

function getManilaDayId(): string {
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const y = manila.getFullYear();
  const m = String(manila.getMonth() + 1).padStart(2, "0");
  const d = String(manila.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildProjectionEntry(entry: LoyaltyLogInput, logId: string) {
  return {
    logId,
    type: entry.type,
    phone: entry.phone,
    customerName: entry.customerName,
    actorUid: entry.actorUid,
    source: entry.source ?? null,
    storeId: entry.storeId ?? null,
    storeName: entry.storeName ?? null,
    sessionId: entry.sessionId ?? null,
    points: entry.points ?? null,
    amount: entry.amount ?? null,
    createdAtMs: Date.now(),
  };
}

export async function writeLoyaltyLog(entry: LoyaltyLogInput): Promise<void> {
  const db = getAdminDb();
  const dayId = getManilaDayId();
  const metaRef = db.doc(`loyaltyLogsDaily/${dayId}_meta`);
  const logRef = db.collection("loyaltyLogs").doc();

  const projectionEntry = buildProjectionEntry(entry, logRef.id);
  const individualDoc: any = { ...projectionEntry, createdAt: FieldValue.serverTimestamp() };
  delete individualDoc.createdAtMs;

  await db.runTransaction(async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const activePart: number = metaSnap.exists ? Number(metaSnap.data()?.activePart ?? 0) : 0;
    const partRef = db.doc(`loyaltyLogsDaily/${dayId}_${activePart}`);
    const partSnap = await tx.get(partRef);
    const entryCount: number = partSnap.exists ? Number(partSnap.data()?.entryCount ?? 0) : 0;

    tx.set(logRef, individualDoc);

    if (entryCount >= MAX_ENTRIES_PER_PART) {
      const newPartIndex = activePart + 1;
      const newPartRef = db.doc(`loyaltyLogsDaily/${dayId}_${newPartIndex}`);
      tx.set(newPartRef, {
        dayId,
        partIndex: newPartIndex,
        entryCount: 1,
        entries: [projectionEntry],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        metaRef,
        {
          dayId,
          activePart: newPartIndex,
          partCount: newPartIndex + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.set(
        partRef,
        {
          dayId,
          partIndex: activePart,
          entries: FieldValue.arrayUnion(projectionEntry),
          entryCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
          ...(partSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
      if (!metaSnap.exists) {
        tx.set(
          metaRef,
          {
            dayId,
            activePart: 0,
            partCount: 1,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  });
}
