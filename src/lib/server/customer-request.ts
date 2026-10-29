import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";

/**
 * Creates a staff-alert `customerRequests` doc, at most one PENDING per
 * session and type.
 *
 * The dedupe used to be "query for a pending one, then write a random-id doc"
 * outside any transaction, so two quick taps could both see nothing and both
 * alert staff — and the type was filtered after `limit(5)`, so a same-type
 * request past the first five pending docs went unseen.
 *
 * Now a fixed-id lock doc per session+type points at the current request, and
 * the check-and-create runs in one transaction on it: two concurrent taps
 * contend on that one doc, so the loser retries and sees the winner's request.
 * The request docs themselves keep random ids and their shape, because POS
 * and the KDS read and resolve them; a fixed request id would be overwritten
 * the next time the table asked after staff resolved the last one.
 */

export type CustomerRequestType = "assistance" | "griller";

export type CustomerRequestInput = {
  storeId: string;
  sessionId: string;
  participantId: string;
  createdByUid: string;
  type: CustomerRequestType;
  text: string;
  tableNumber: string;
  tableDisplayName: string;
  customerName: string | null;
};

export async function createPendingCustomerRequest(
  db: Firestore,
  input: CustomerRequestInput
): Promise<{ requestId: string; deduped: boolean }> {
  const { storeId, sessionId, type } = input;
  const requestsRef = db.collection(`stores/${storeId}/customerRequests`);
  const lockRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}/customerRequestLocks/${type}`);

  return db.runTransaction(async (tx: Transaction) => {
    const lockSnap = await tx.get(lockRef);
    const pointedId = lockSnap.exists ? String((lockSnap.data() as any)?.requestId || "") : "";

    if (pointedId) {
      const pointed = await tx.get(requestsRef.doc(pointedId));
      if (pointed.exists && (pointed.data() as any)?.status === "pending") {
        return { requestId: pointedId, deduped: true };
      }
    } else {
      // No lock yet: a request made before the lock existed may still be
      // pending. Type is part of the query, so another type's requests can
      // no longer crowd it out of the sample.
      const legacy = await tx.get(
        requestsRef
          .where("sessionId", "==", sessionId)
          .where("type", "==", type)
          .where("status", "==", "pending")
          .limit(1)
      );
      if (!legacy.empty) {
        const id = legacy.docs[0].id;
        tx.set(lockRef, { requestId: id, type, updatedAt: FieldValue.serverTimestamp() });
        return { requestId: id, deduped: true };
      }
    }

    const requestRef = requestsRef.doc();
    tx.create(requestRef, {
      id: requestRef.id,
      storeId,
      sessionId,
      participantId: input.participantId,
      type,
      text: input.text,
      tableNumber: input.tableNumber,
      tableDisplayName: input.tableDisplayName,
      customerName: input.customerName,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      createdAtClientMs: Date.now(),
      createdByUid: input.createdByUid,
    });
    tx.set(lockRef, { requestId: requestRef.id, type, updatedAt: FieldValue.serverTimestamp() });
    return { requestId: requestRef.id, deduped: false };
  });
}
