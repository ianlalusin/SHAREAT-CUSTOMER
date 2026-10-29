import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import {
  claimRefillCooldowns,
  releaseRefillCooldowns,
  type ClaimedCooldowns,
} from "@/lib/server/refill-cooldown";
import {
  REFILL_COOLDOWN_MS,
  blockedRefillsDetailed,
  mergeCooldownStamps,
  toNextAllowedMap,
  type CooldownMap,
} from "@/lib/refill-cooldown";
import { getRefillOptionsMenu, type RefillOptionsMenu } from "@/lib/server/refill-options-cache";
import { validateRefillLine } from "@/lib/refill-validate";
import { existingKitchenTicketIds, writeKitchenTicket } from "@/lib/server/kitchen-ticket-write";
import { deriveKitchenTicketId, normalizeRequestId } from "@/lib/kitchen-ticket-id";
import { refillTicketState } from "@/lib/server/refill-outstanding";

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
  /** Deterministic ticket id when the request carried a requestId, else undefined. */
  ticketId?: string;
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
    if (items.length > 30) return bad("Too many refill lines in one order.", 400);

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

    // ---- the branch's refill menu: the source of truth for every line -----
    // Required, not best-effort: without it there is nothing to check a line
    // against, and an unchecked line is a free item the kitchen will cook.
    let menu: RefillOptionsMenu;
    try {
      menu = await getRefillOptionsMenu(db, storeId);
    } catch {
      return bad("Could not load the refill menu. Please try again.", 503);
    }
    const flavorNameById = new Map(menu.storeFlavors.map((f) => [f.flavorId, f.flavorName] as const));
    const refillNameById = new Map(menu.storeRefills.map((r) => [r.refillId, r.refillName] as const));

    // ---- validate every item BEFORE writing any ticket ---------------------
    // Validation used to live inside the write loop, so a bad item halfway
    // through left the earlier tickets already sitting in the kitchen. Item,
    // name, station and quantity all come from the menu now — see
    // validateRefillLine for why the request's own copies are not trusted.
    const normalized: NormalizedItem[] = [];

    // One id per "Send order" tap, reused if the guest retries the same cart.
    // Absent (a client that predates it) means random ticket ids, as before.
    const requestKey = normalizeRequestId(body?.requestId);

    for (const [lineIndex, it] of items.entries()) {
      const check = validateRefillLine(it, menu);
      if (!check.ok) return bad(check.error, 400);
      const line = { ...check.line, notes: String(it?.notes || "").slice(0, 200) };
      normalized.push({
        ...line,
        ticketId: requestKey
          ? deriveKitchenTicketId({
              kind: "refill",
              storeId,
              sessionId,
              participantId,
              requestId: requestKey,
              lineIndex,
              lineKey: JSON.stringify([line.itemId, line.qty, line.cooldownIds, line.refillRequest, line.notes]),
            })
          : undefined,
      });
    }

    // ---- lines an earlier attempt of this same request already wrote --------
    // A retry after a part-written order must finish it, not be refused by
    // its own first half: those tickets now sit "in the kitchen" and hold a
    // claimed cooldown, so every gate below would block them. Only the lines
    // still missing go through the gates, the claim and the write.
    const alreadyWritten = requestKey
      ? await existingKitchenTicketIds(
          db,
          storeId,
          sessionId,
          normalized.map((n) => n.ticketId as string)
        )
      : new Set<string>();
    const pending = normalized.filter((n) => !n.ticketId || !alreadyWritten.has(n.ticketId));

    // Everything landed on an earlier attempt and only the response was lost:
    // answer as that attempt would have, without claiming anything again.
    if (!pending.length) {
      const cooldowns = mergeCooldownStamps(participantInfo.refillCooldowns, undefined);
      return NextResponse.json({
        ok: true,
        ticketIds: normalized.map((n) => n.ticketId as string),
        refillCooldowns: {
          cooldownMs: REFILL_COOLDOWN_MS,
          nextAllowedAt: toNextAllowedMap(cooldowns, Date.now()),
        },
      });
    }

    // ---- claim the per-meat cooldowns (atomic, all-or-nothing) -------------
    const labels: Record<string, string> = {};
    for (const n of pending) {
      for (const id of n.cooldownIds) {
        // "Other Refills" is one line covering several sides, so its itemName is
        // the bundle label. Without the menu lookup the guest gets told "OTHER
        // REFILLS is cooling down" when really it is just the Rice.
        labels[id] = labels[id] || refillNameById.get(id) || n.itemName;
      }
    }

    // ---- refuse anything still sitting in the kitchen ---------------------
    // Checked BEFORE the claim, alongside the other validation: the same reason
    // item validation moved out of the write loop — a refusal must not leave
    // half an order already with the kitchen. The claim below stays the race
    // guard for double taps.
    const requestedIds = pending.flatMap((n) => n.cooldownIds);
    const { outstanding, servedAt, firstServingPending } = await refillTicketState(
      db,
      storeId,
      sessionId,
      participantId
    );

    // The table's opening order has not landed yet. The dashboard already
    // refuses to open the refill modal in this state; this is the control
    // behind that courtesy message, so the gate is not merely cosmetic.
    // Bounded by FIRST_SERVING_BLOCK_MAX_MS inside refillTicketState, so a
    // package ticket the kitchen forgets cannot lock refills for the whole meal.
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
    const stillCooking = blockedRefillsDetailed(
      participantInfo.refillCooldowns,
      outstanding,
      requestedIds,
      Date.now()
    ).filter((b) => b.reason === "in_kitchen");

    if (stillCooking.length) {
      const names = stillCooking.map((b) => labels[b.refillId] || b.refillId);
      const error =
        names.length === 1
          ? `Your ${names[0]} is still with the kitchen. You can order it again once it arrives.`
          : `These are still with the kitchen: ${names.join(", ")}. You can order them again once they arrive.`;
      return NextResponse.json(
        {
          ok: false,
          error,
          blocked: stillCooking.map((b) => ({ ...b, refillName: labels[b.refillId] || b.refillId })),
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
        refillIds: requestedIds,
        labels,
        // The minute runs from the serve, so a refill the kitchen handed over
        // seconds ago is still blocked even though its order stamp is stale.
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

    const tableNumber = String(active.tableNumber || "");
    const sessionLabel = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const sessionMode = String(active.sessionMode || "package_dinein");
    const customerName = active.customerName ?? null;
    const guestCount = Number(active.guestCountFinal ?? active.guestCountCashierInitial ?? active.guestCount ?? 0) || 0;

    const createdTicketIds: string[] = [];
    /** Refill types whose ticket did reach the kitchen on this attempt. */
    const writtenCooldownIds = new Set<string>();

    try {
      for (const item of pending) {
        const flavorNote = item.flavorIds.map((id) => flavorNameById.get(id) || id).join(", ");

        const ticketId = await writeKitchenTicket(db, {
          storeId,
          sessionId,
          kitchenLocationId: item.kitchenLocationId,
          kitchenLocationName: item.kitchenLocationName,
          type: "refill",
          ticketId: item.ticketId,
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
            // The refill types this ticket covers, so the in-kitchen block can
            // recognise it. `refillRequest` cannot serve this: it is keyed by
            // display name for the KDS card, not by refill id — and a bundle's
            // own `itemId` is just the label "OTHER_REFILLS".
            refillIds: item.cooldownIds,
          },
        });

        createdTicketIds.push(ticketId);
        for (const id of item.cooldownIds) writtenCooldownIds.add(id);
      }
    } catch (e: any) {
      // Hand the cooldown back — a failed order must not cost the guest their
      // next one. Only for the lines that failed, though: a refill whose ticket
      // did reach the kitchen was really ordered, so its stamp stays.
      await releaseRefillCooldowns(db, {
        storeId,
        sessionId,
        participantId,
        claimed: { ...claimed, refillIds: claimed.refillIds.filter((id) => !writtenCooldownIds.has(id)) },
      });
      throw e;
    }

    const updatedCooldowns: CooldownMap = mergeCooldownStamps(
      participantInfo.refillCooldowns,
      servedAt
    );
    for (const id of claimed.refillIds) updatedCooldowns[id] = claimed.claimedAtMs;

    return NextResponse.json({
      ok: true,
      // With a requestId, the whole order's ids — including lines an earlier
      // attempt wrote — so a retry reports the same order the first try would.
      ticketIds: requestKey ? normalized.map((n) => n.ticketId as string) : createdTicketIds,
      refillCooldowns: {
        cooldownMs: REFILL_COOLDOWN_MS,
        nextAllowedAt: toNextAllowedMap(updatedCooldowns, Date.now()),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
