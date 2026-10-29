import type { Firestore } from "firebase-admin/firestore";
import { loadAndValidateSessionAccess } from "@/lib/server/customer-session-access";
import { validateActiveParticipant } from "@/lib/server/customer-participants";

/**
 * Is this table-session token still a diner at an open table, right now?
 *
 * A customer token outlives what it was issued for: the cashier can switch
 * customer access off, the access window can run out, or one phone can be
 * removed from the table — and the token still verifies. Ordering already
 * re-checks all three; this is the same check for everything else (loyalty
 * card, games), so revoking a phone actually revokes it.
 *
 * Only for `decoded.customer === true` tokens. A loyalty-card login (no table)
 * is a different credential and is not judged here.
 */
export async function checkLiveParticipant(
  db: Firestore,
  decoded: any
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const storeId = String(decoded?.storeId || "");
  const sessionId = String(decoded?.sessionId || "");
  const participantId = String(decoded?.participantId || "");
  if (!storeId || !sessionId) return { ok: false, status: 403, error: "Not a table session." };
  if (!participantId) return { ok: false, status: 403, error: "Please re-enter your table PIN." };
  try {
    await loadAndValidateSessionAccess(db, storeId, sessionId);
    await validateActiveParticipant(db, storeId, sessionId, participantId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, status: e?.httpStatus || 403, error: e?.message || "Your table access has ended." };
  }
}
