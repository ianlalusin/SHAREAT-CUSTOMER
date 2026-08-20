import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import {
  claimRefillCooldowns,
  releaseRefillCooldowns,
  type ClaimedCooldowns,
} from "@/lib/server/refill-cooldown";
import { REFILL_COOLDOWN_MS, toNextAllowedMap, type CooldownMap } from "@/lib/refill-cooldown";
import { getRefillOptionsMenu } from "@/lib/server/refill-options-cache";
import { writeKitchenTicket } from "@/lib/server/kitchen-ticket-write";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type NormalizedItem = {
  itemId: string;
  itemName: string;
  kitchenLocationId: string;
  kitchenLocationName: string;
  qty: number;
  notes: string;
  flavorIds: string[];
  refillRequest: Record<string, number> | null;
  /** The refill types this line puts on cooldown. */
  cooldownIds: string[];
};

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

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return bad("No refill items.", 400);

    const db = getAdminDb();

    const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
    const activeSnap = await activeRef.get();
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

    // ---- validate every item BEFORE writing any ticket ---------------------
    // Validation used to live inside the write loop, so a bad item halfway
    // through left the earlier tickets already sitting in the kitchen.
    const normalized: NormalizedItem[] = [];

    for (const it of items) {
      const itemId = String(it?.itemId || it?.refillId || "");
      const itemName = String(it?.itemName || it?.refillName || "");
      const kitchenLocationId = String(it?.kitchenLocationId || "");
      const kitchenLocationName = String(it?.kitchenLocationName || "Kitchen");
      const qty = Number(it?.qty || 1);
      const notes = String(it?.notes || "");
      const flavorIds = Array.isArray(it?.flavorIds) ? it.flavorIds.map(String).filter(Boolean) : [];

      if (!itemId || !itemName) return bad("Invalid item payload.", 400);
      if (!kitchenLocationId) return bad("Missing kitchenLocationId.", 400);
      if (flavorIds.length > 1) {
        return bad(`Only 1 flavor per meat is allowed — "${itemName}" has ${flavorIds.length}.`, 400);
      }

      // "Other Refills" arrive as one combined line per station; each side item
      // inside it gets its own cooldown, under the same per-type rule.
      const bundledIds = Array.isArray(it?.refillIds) ? it.refillIds.map(String).filter(Boolean) : [];

      normalized.push({
        itemId,
        itemName,
        kitchenLocationId,
        kitchenLocationName,
        qty,
        notes,
        flavorIds,
        refillRequest:
          it && typeof it === "object" && (it as any).refillRequest ? (it as any).refillRequest : null,
        cooldownIds: bundledIds.length ? bundledIds : [itemId],
      });
    }

    // ---- resolve flavor names so the ticket carries a real flavorNote ------
    // The KDS card renders `flavorNote`; only the POS staff path used to set it,
    // so customer-chosen flavors showed up under a different heading.
    // One cached-doc read covers both the flavor names for the ticket note and
    // the per-refill names for cooldown messages. Names come from the menu, not
    // from the client, so a guest cannot spoof what the kitchen sees.
    const flavorNameById = new Map<string, string>();
    const refillNameById = new Map<string, string>();
    try {
      const menu = await getRefillOptionsMenu(db, storeId);
      for (const f of menu.storeFlavors) flavorNameById.set(f.flavorId, f.flavorName);
      for (const r of menu.storeRefills) refillNameById.set(r.refillId, r.refillName);
    } catch {
      // Non-fatal: fall back to raw ids/client names rather than failing the order.
    }

    // ---- claim the per-meat cooldowns (atomic, all-or-nothing) -------------
    const labels: Record<string, string> = {};
    for (const n of normalized) {
      for (const id of n.cooldownIds) {
        // "Other Refills" is one line covering several sides, so its itemName is
        // the bundle label. Without the menu lookup the guest gets told "OTHER
        // REFILLS is cooling down" when really it is just the Rice.
        labels[id] = labels[id] || refillNameById.get(id) || n.itemName;
      }
    }

    let claimed: ClaimedCooldowns;
    try {
      claimed = await claimRefillCooldowns(db, {
        storeId,
        sessionId,
        participantId,
        refillIds: normalized.flatMap((n) => n.cooldownIds),
        labels,
      });
    } catch (e: any) {
      if (e?.httpStatus === 429) {
        return NextResponse.json(
          { ok: false, error: e.message, blocked: e.blocked ?? [], cooldownMs: REFILL_COOLDOWN_MS },
          { status: 429 }
        );
      }
      return bad(e?.message ?? "Could not start your refill.", e?.httpStatus || 403);
    }

    const tableNumber = String(active.tableNumber || "");
    const sessionLabel = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const sessionMode = String(active.sessionMode || "package_dinein");
    const customerName = active.customerName ?? null;
    const guestCount = Number(active.guestCountFinal ?? active.guestCountCashierInitial ?? active.guestCount ?? 0) || 0;

    const createdTicketIds: string[] = [];

    try {
      for (const item of normalized) {
        const flavorNote = item.flavorIds.map((id) => flavorNameById.get(id) || id).join(", ");

        const ticketId = await writeKitchenTicket(db, {
          storeId,
          sessionId,
          kitchenLocationId: item.kitchenLocationId,
          kitchenLocationName: item.kitchenLocationName,
          type: "refill",
          itemId: item.itemId,
          itemName: item.itemName,
          qty: item.qty,
          notes: item.notes,
          session: { tableNumber, sessionLabel, sessionMode, customerName, guestCount },
          actor: {
            createdByUid,
            participantId,
            slotNumber: participantInfo.slotNumber,
            joinMethod: participantInfo.joinMethod,
          },
          extra: {
            flavorNote: flavorNote || null,
            refillRequest: item.refillRequest,
          },
        });

        createdTicketIds.push(ticketId);
      }
    } catch (e: any) {
      // Hand the cooldown back — a failed order must not cost the guest 10 minutes.
      await releaseRefillCooldowns(db, { storeId, sessionId, participantId, claimed });
      throw e;
    }

    const updatedCooldowns: CooldownMap = { ...participantInfo.refillCooldowns };
    for (const id of claimed.refillIds) updatedCooldowns[id] = claimed.claimedAtMs;

    return NextResponse.json({
      ok: true,
      ticketIds: createdTicketIds,
      refillCooldowns: {
        cooldownMs: REFILL_COOLDOWN_MS,
        nextAllowedAt: toNextAllowedMap(updatedCooldowns, Date.now()),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
