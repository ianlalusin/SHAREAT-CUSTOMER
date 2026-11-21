import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { isCaptureShareLive, isPrintingEnabled, readBodyLimited, savePrintRequest, validateUpload } from "@/lib/server/games/capture-share-store";
import { manilaDayKey } from "@/lib/games/ghost-hunt/rules";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Send the finished photo to the cashier's thermal printer queue (POS, PIN page,
 * "Photo prints" tab). Body is the raw JPEG. Nothing is billed here: POS counts
 * prints, the first per table free (owner's call, 2026-11-21).
 */
export async function POST(req: Request) {
  try {
    const gate = await requirePlayer(req);
    if (!gate.ok) return bad(gate.error, gate.status);
    const db = getAdminDb();
    if (!(await isCaptureShareLive(db, gate.player.storeId))) return bad("Capture & Share isn't running at this branch right now.", 403);
    if (!(await isPrintingEnabled(db, gate.player.storeId))) return bad("Printing isn't available right now. Save or share your photo instead.", 403);

    const photoId = String(req.headers.get("x-photo-id") || "");
    const layout = String(req.headers.get("x-layout") || "").replace(/[^a-z0-9-]/gi, "");
    if (Number(req.headers.get("content-length") || 0) > 5 * 1024 * 1024) return bad("Photo is too large.", 413);
    const bytes = await readBodyLimited(req);
    if (!bytes) return bad("Photo is too large.", 413);
    const invalid = validateUpload(bytes, photoId);
    if (invalid) return bad(invalid);

    const p = gate.player;
    const r = await savePrintRequest(db, {
      storeId: p.storeId,
      sessionId: p.sessionId,
      identityKey: p.identityKey,
      tableDisplayName: p.tableDisplayName,
      customerName: p.customerName,
      photoId,
      layout,
      dayKey: manilaDayKey(Date.now()),
      bytes,
    });
    if (!r.ok) return bad(r.error, r.status);
    return NextResponse.json({ ok: true, already: r.already });
  } catch (e) {
    return bad((e as Error)?.message || "Could not send the print request.", 500);
  }
}
