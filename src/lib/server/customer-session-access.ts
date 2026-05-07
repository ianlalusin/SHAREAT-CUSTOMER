import type { Firestore } from "firebase-admin/firestore";

export interface SessionAccessData {
  storeId: string;
  sessionId: string;
  customerName: string | null;
  tableNumber: string;
  tableDisplayName: string;
  sessionMode: string;
  packageOfferingId: string;
  initialFlavorIds: string[];
  customerParticipantLimit: number;
  customerParticipantActiveCount: number;
  customerJoinVersion: number;
  customerAccessExpiresAtMs: number;
}

export async function loadAndValidateSessionAccess(
  db: Firestore,
  storeId: string,
  sessionId: string
): Promise<SessionAccessData> {
  const snap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
  if (!snap.exists) {
    throw Object.assign(new Error("Session not found."), { httpStatus: 404 });
  }
  const s = snap.data() as Record<string, any>;

  if (s.customerAccessEnabled !== true) {
    throw Object.assign(new Error("Customer access disabled."), { httpStatus: 403 });
  }
  const expiresAtMs = Number(s.customerAccessExpiresAtMs || 0);
  if (expiresAtMs <= Date.now()) {
    throw Object.assign(new Error("Customer access expired."), { httpStatus: 403 });
  }

  const limit =
    s.guestCountFinal != null ? Number(s.guestCountFinal) :
    s.guestCountCashierInitial != null ? Number(s.guestCountCashierInitial) :
    s.guestCount != null ? Number(s.guestCount) : 1;

  return {
    storeId,
    sessionId,
    customerName: s.customerName ?? null,
    tableNumber: String(s.tableNumber || ""),
    tableDisplayName: String(s.tableDisplayName || ""),
    sessionMode: String(s.sessionMode || "package_dinein"),
    packageOfferingId: String(s.packageOfferingId || ""),
    initialFlavorIds: Array.isArray(s.initialFlavorIds) ? s.initialFlavorIds : [],
    customerParticipantLimit: limit,
    customerParticipantActiveCount: Number(s.customerParticipantActiveCount || 0),
    customerJoinVersion: Number(s.customerJoinVersion || 0),
    customerAccessExpiresAtMs: expiresAtMs,
  };
}
