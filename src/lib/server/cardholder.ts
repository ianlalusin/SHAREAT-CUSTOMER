import type { DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { resolveTokenCard } from "@/lib/server/session-link";

/**
 * Whose card is this request acting for? One answer for every "act as the
 * cardholder" route (transfer, receive code).
 *
 * A table token acts only as the participant that linked the card; a cashier
 * link is earn-only; a phone removed from the table or a table closed to
 * customers gets nothing (audit SEC-04). A signed-in loyalty member is their
 * own phone.
 */
export type Cardholder = { ok: true; phone: string } | { ok: false; status: number; message: string };

export async function resolveCardholder(db: Firestore, decoded: DecodedIdToken): Promise<Cardholder> {
  if (decoded?.customer === true) {
    const storeId = String(decoded.storeId || "");
    const sessionId = String(decoded.sessionId || "");
    if (!storeId || !sessionId) return { ok: false, status: 403, message: "Session claims missing." };
    const card = await resolveTokenCard(db, decoded);
    if (!card.ok) return { ok: false, status: card.reason === "none" ? 400 : 403, message: card.message };
    return card.phone ? { ok: true, phone: card.phone } : { ok: false, status: 400, message: "No loyalty card linked to this session." };
  }
  if (decoded?.loyaltyCustomer === true) {
    const phone = String(decoded.phone || "");
    return phone ? { ok: true, phone } : { ok: false, status: 400, message: "No loyalty card linked to this session." };
  }
  return { ok: false, status: 403, message: "Unauthorized." };
}
