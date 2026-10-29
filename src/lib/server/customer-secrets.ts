import { FieldValue, type DocumentReference, type Firestore, type WriteBatch } from "firebase-admin/firestore";

/**
 * Where a Sharelebrator customer's password hash lives (POS audit B05,
 * 2026-10-29).
 *
 * It used to sit on customers/{phone} itself, next to name/points, where POS
 * staff could read it. It now lives at customers/{phone}/secrets/auth, which no
 * Firestore rule lets any client read — only the Admin SDK reaches it. POS has
 * the same helper (src/lib/server/customer-secrets.ts) and the migration script
 * (scripts/migrate-customer-secrets.ts).
 *
 * Transition: both apps write the hash to BOTH places until
 * CUSTOMER_SECRETS_LEGACY_FIELD=off. Reads prefer the legacy field while it
 * exists — a password changed through an older deploy only updated that field,
 * so it is the fresher copy — and fall back to the secret doc once the
 * migration's --remove-legacy phase has deleted it.
 */

export const CUSTOMER_SECRET_DOC_ID = "auth";

export function customerSecretRef(db: Firestore, phone: string): DocumentReference {
  return db.doc(`customers/${phone}/secrets/${CUSTOMER_SECRET_DOC_ID}`);
}

/** Default ON (dual-write). Only the literal "off" stops writing the legacy field. */
export function legacyPasswordFieldEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.CUSTOMER_SECRETS_LEGACY_FIELD ?? "").trim().toLowerCase() !== "off";
}

/** The hash to verify a login against; "" when the customer has none. */
export async function readCustomerPasswordHash(
  db: Firestore,
  phone: string,
  profile: Record<string, any> | undefined
): Promise<string> {
  const legacy = typeof profile?.passwordHash === "string" ? profile.passwordHash : "";
  if (legacy) return legacy;
  const snap = await customerSecretRef(db, phone).get();
  return snap.exists ? String(snap.data()?.passwordHash || "") : "";
}

/**
 * Stages a new hash on the secret doc inside the caller's batch and returns the
 * fields to merge into the profile update (the legacy copy while dual-writing,
 * otherwise a delete of any leftover).
 */
export function stageCustomerPasswordHash(
  batch: WriteBatch,
  db: Firestore,
  phone: string,
  passwordHash: string,
  env: Record<string, string | undefined> = process.env
): Record<string, unknown> {
  batch.set(customerSecretRef(db, phone), { passwordHash, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { passwordHash: legacyPasswordFieldEnabled(env) ? passwordHash : FieldValue.delete() };
}
