import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import {
  claimRefillCooldowns,
  releaseRefillCooldowns,
  type ClaimedCooldowns,
} from "@/lib/server/refill-cooldown";
import { REFILL_COOLDOWN_MS } from "@/lib/refill-cooldown";
import { getRefillOptionsMenu } from "@/lib/server/refill-options-cache";
import { refillTicketState } from "@/lib/server/refill-outstanding";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const decoded = await getAdminAuth().verifyIdToken(m[1]);
    if (decoded.customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    const participantId = String((decoded as any).participantId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);
    if (!participantId) return bad("Missing participantId in token. Please re-enter your PIN.", 403);

    const createdByUid = String(decoded.uid || "");

    const db = getAdminDb();

    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!activeSnap.exists) return bad("Session not found.", 404);

    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    let participantInfo;
    try {
      participantInfo = await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    const tableNumber = String(active.tableNumber || "");
    const sessionLabel = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const sessionMode = String(active.sessionMode || "package_dinein");
    const customerName = active.customerName ?? null;
    const guestCount = Number(active.guestCountFinal ?? active.guestCountCashierInitial ?? active.guestCount ?? 0) || 0;
    const packageOfferingId = String(active.packageOfferingId || "");
    let packageName = String(active.packageName || active.packageSnapshot?.name || "");

    let refillsAllowed: string[] = [];
    if (packageOfferingId) {
      const pkgSnap = await db.doc(`stores/${storeId}/storePackages/${packageOfferingId}`).get();
      if (pkgSnap.exists) {
        const pkg = pkgSnap.data() as any;
        packageName = String(pkg.packageName || pkg.name || packageName || "");
        refillsAllowed = Array.isArray(pkg.refillsAllowed) ? pkg.refillsAllowed : [];
      }
    }
    if (!refillsAllowed.length) return bad("No refills allowed for this package.", 400);

    const firstRefillId = String(refillsAllowed[0] || "");
    const firstRefillSnap = await db.doc(`stores/${storeId}/storeRefills/${firstRefillId}`).get();
    if (!firstRefillSnap.exists) return bad("First refill config not found.", 500);

    const firstRefill = firstRefillSnap.data() as any;
    const kitchenLocationId = String(firstRefill.kitchenLocationId || "");
    const kitchenLocationName = String(firstRefill.kitchenLocationName || "Kitchen");
    if (!kitchenLocationId) return bad("First refill has no kitchenLocationId.", 500);

    const initialFlavorIds = Array.isArray(active.initialFlavorIds) ? active.initialFlavorIds : [];

    // Flavors belong in flavorNote (rendered inline with the item on the KDS),
    // not in notes — notes is the guest's own text. This used to write raw
    // flavor IDs into notes.
    let flavorNote = "";
    if (initialFlavorIds.length) {
      try {
        const menu = await getRefillOptionsMenu(db, storeId);
        const nameById = new Map(menu.storeFlavors.map((f) => [f.flavorId, f.flavorName]));
        flavorNote = initialFlavorIds.map((id: string) => nameById.get(id) || id).join(", ");
      } catch {
        flavorNote = initialFlavorIds.join(", ");
      }
    }
    const notes = "";

    // Same per-meat, per-phone rules as /submit-refill. No UI calls this route
    // today, but it is a live endpoint that writes refill tickets — leaving it
    // ungated would be an open bypass.
    const refillLabel = String(firstRefill.refillName || firstRefill.name || "This refill");

    const { outstanding, servedAt, firstServingPending } = await refillTicketState(
      db,
      storeId,
      sessionId,
      participantId
    );

    // Same gate as /submit-refill — this route writes refill tickets too, and
    // leaving it open would be the bypass.
    if (firstServingPending) {
      return NextResponse.json(
        {
          ok: false,
          error: "Your first serving is still with the kitchen. You can order refills once it arrives at your table.",
          reason: "first_serving_pending",
          cooldownMs: REFILL_COOLDOWN_MS,
        },
        { status: 429 }
      );
    }

    if (outstanding.has(firstRefillId)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Your ${refillLabel} is still with the kitchen. You can order it again once it arrives.`,
          blocked: [{ refillId: firstRefillId, refillName: refillLabel, reason: "in_kitchen", nextAllowedAtMs: 0 }],
          cooldownMs: REFILL_COOLDOWN_MS,
        },
        { status: 429 }
      );
    }

    let claimed: ClaimedCooldowns;
    try {
      claimed = await claimRefillCooldowns(db, {
        storeId,
        sessionId,
        participantId,
        refillIds: [firstRefillId],
        labels: { [firstRefillId]: refillLabel },
        // The minute runs from the serve, same as /submit-refill.
        servedAt,
      });
    } catch (e: any) {
      if (e?.httpStatus === 429) {
        return NextResponse.json(
          {
            ok: false,
            error: e.message,
            blocked: (e.blocked ?? []).map((b: any) => ({ reason: "cooldown", ...b })),
            cooldownMs: REFILL_COOLDOWN_MS,
          },
          { status: 429 }
        );
      }
      return bad(e?.message ?? "Could not start your refill.", e?.httpStatus || 403);
    }

    const ticketRef = db.collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`).doc();
    const rtRef = db.doc(`stores/${storeId}/rtKdsTickets/${kitchenLocationId}`);
    const createdAtClientMs = Date.now();

    const writeTicket = () => db.runTransaction(async (tx: any) => {
      const rtSnap = await tx.get(rtRef);
      const rt = rtSnap.exists ? (rtSnap.data() as any) : {};

      const activeIds: string[] = Array.isArray(rt.activeIds) ? [...rt.activeIds] : [];
      const tickets: Record<string, any> = rt.tickets && typeof rt.tickets === "object" ? { ...rt.tickets } : {};
      const sessionIndex: Record<string, string[]> =
        rt.sessionIndex && typeof rt.sessionIndex === "object" ? { ...rt.sessionIndex } : {};

      const ticket = {
        billLineId: null,
        createdAt: FieldValue.serverTimestamp(),
        createdAtClientMs,
        createdByUid,
        createdByParticipantId: participantId,
        createdBySlotNumber: participantInfo.slotNumber,
        createdByJoinMethod: participantInfo.joinMethod,
        customerName,
        durationMs: 0,
        guestCount,
        id: ticketRef.id,
        itemId: `repeat_first_order_${packageOfferingId || "package"}`,
        itemName: `REFILL - ${packageName || "PACKAGE"}`,
        // This ticket's itemId is a package marker, not a refill id, so the
        // in-kitchen block would never match it without this list.
        refillIds: [firstRefillId],
        kitchenLocationId,
        kitchenLocationName,
        flavorNote: flavorNote || null,
        notes,
        qty: 1,
        sessionId,
        sessionLabel,
        sessionMode,
        status: "preparing",
        storeId,
        tableNumber,
        type: "refill",
        updatedAt: FieldValue.serverTimestamp(),
        refillsAllowed,
        initialFlavorIds,
      };

      tx.set(ticketRef, ticket, { merge: false });

      tickets[ticketRef.id] = ticket;
      if (!activeIds.includes(ticketRef.id)) activeIds.unshift(ticketRef.id);
      const idxArr = Array.isArray(sessionIndex[sessionId]) ? [...sessionIndex[sessionId]] : [];
      if (!idxArr.includes(ticketRef.id)) idxArr.unshift(ticketRef.id);
      sessionIndex[sessionId] = idxArr;

      tx.set(rtRef, {
        kitchenLocationId,
        activeIds,
        sessionIndex,
        tickets,
        meta: { source: "createKitchenTickets", updatedAt: FieldValue.serverTimestamp() },
      }, { merge: true });
    });

    try {
      await writeTicket();
    } catch (e: any) {
      // Hand the cooldown back — a failed order must not cost the guest their next one.
      await releaseRefillCooldowns(db, { storeId, sessionId, participantId, claimed });
      throw e;
    }

    return NextResponse.json({
      ok: true,
      ticketId: ticketRef.id,
      kitchenLocationId,
      kitchenLocationName,
      itemName: `REFILL - ${packageName || "PACKAGE"}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
