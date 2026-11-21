import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { deleteConsentedPhoto, isCaptureShareLive, isPrintingEnabled, readPaperWidth, saveConsentedPhoto, validateUpload } from "@/lib/server/games/capture-share-store";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

const OFF = "Capture & Share isn't running at this branch right now.";

/** Can this diner play here, and the branch name for the photo caption. */
export async function GET(req: Request) {
  try {
    const gate = await requirePlayer(req);
    if (!gate.ok) return bad(gate.error, gate.status);
    const db = getAdminDb();
    if (!(await isCaptureShareLive(db, gate.player.storeId))) return bad(OFF, 403);
    const p = gate.player;
    // Name and table prefill the templates (ID card name, ticket stub); paper decides which layouts can print.
    return NextResponse.json({
      ok: true,
      storeName: p.storeName,
      customerName: p.customerName,
      tableName: p.tableDisplayName,
      paperWidth: await readPaperWidth(db, p.storeId),
      printing: await isPrintingEnabled(db),
    });
  } catch (e) {
    return bad((e as Error)?.message || "Could not open Capture & Share.", 500);
  }
}

/**
 * Keep a photo the diner agreed we may post. Body is the raw JPEG; nothing is
 * called here unless they ticked the consent box.
 */
export async function POST(req: Request) {
  try {
    const gate = await requirePlayer(req);
    if (!gate.ok) return bad(gate.error, gate.status);
    const db = getAdminDb();
    if (!(await isCaptureShareLive(db, gate.player.storeId))) return bad(OFF, 403);

    const photoId = String(req.headers.get("x-photo-id") || "");
    const layout = String(req.headers.get("x-layout") || "").replace(/[^a-z0-9-]/gi, "");
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > 5 * 1024 * 1024) return bad("Photo is too large.", 413);

    const bytes = new Uint8Array(await req.arrayBuffer());
    const invalid = validateUpload(bytes, photoId);
    if (invalid) return bad(invalid);

    const p = gate.player;
    const r = await saveConsentedPhoto(db, {
      storeId: p.storeId,
      storeName: p.storeName,
      sessionId: p.sessionId,
      identityKey: p.identityKey,
      tableDisplayName: p.tableDisplayName,
      photoId,
      layout,
      bytes,
    });
    if (!r.ok) return bad(r.error, r.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad((e as Error)?.message || "Could not save the photo.", 500);
  }
}

/**
 * The diner unticked the box: take their consented photo back out. Scoped to
 * their own table session's photo id, and not gated on the game being live —
 * withdrawing consent must always work. Idempotent: an already-gone photo is fine.
 */
export async function DELETE(req: Request) {
  try {
    const gate = await requirePlayer(req);
    if (!gate.ok) return bad(gate.error, gate.status);
    const photoId = String(req.headers.get("x-photo-id") || "");
    if (!/^[A-Za-z0-9-]{6,40}$/.test(photoId)) return bad("Bad photo id.");
    const { storeId, sessionId } = gate.player;
    await deleteConsentedPhoto(getAdminDb(), storeId, `${sessionId}_${photoId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad((e as Error)?.message || "Could not remove the photo.", 500);
  }
}
