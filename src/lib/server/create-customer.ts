import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";

export type NewCustomerFields = {
  phone: string;
  passwordHash: string;
  name: string;
  address: string;
  email: string | null;
  bday: string;
};

/** gRPC ALREADY_EXISTS, which a create() on an existing doc fails with. */
function isAlreadyExists(e: any): boolean {
  return e?.code === 6 || e?.code === "already-exists" || /already exists/i.test(String(e?.message || ""));
}

/**
 * Create a loyalty account, create-only.
 *
 * Both signup paths read for existence, then spend ~100ms in bcrypt, so two
 * signups for one phone could both see "absent" — and an unconditional set()
 * let the later one silently replace the first account's password and profile.
 * `create()` fails if the doc exists, and it shares a batch with the
 * totalAccounts increment, so the aggregate moves only for an account that was
 * really created.
 *
 * Returns false when the phone is already registered; other errors throw.
 */
export async function createCustomerAccount(
  db: Firestore,
  ref: DocumentReference,
  fields: NewCustomerFields
): Promise<boolean> {
  const batch = db.batch();
  batch.create(ref, {
    ...fields,
    // Which privacy notice the owner agreed to, and when. Both signup routes
    // refuse to get here without that agreement.
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    privacyAcceptedAt: FieldValue.serverTimestamp(),
    pointsBalance: 0,
    visitCount: 0,
    storeVisits: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Global aggregate projection
  batch.set(
    db.doc("loyaltyStats/global"),
    { totalAccounts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  try {
    await batch.commit();
    return true;
  } catch (e) {
    if (isAlreadyExists(e)) return false;
    throw e;
  }
}
