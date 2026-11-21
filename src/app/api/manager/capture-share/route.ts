import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
import { deleteConsentedPhoto, listConsentedPhotos } from "@/lib/server/games/capture-share-store";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Photos diners agreed SharEat may post, for one branch. A manager sees their
 * own branch; a platform admin passes requireStoreAccess for any branch.
 */
export async function GET(req: Request) {
  const storeId = String(new URL(req.url).searchParams.get("storeId") || "");
  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);
  try {
    return NextResponse.json({ ok: true, photos: await listConsentedPhotos(getAdminDb(), storeId) });
  } catch (e) {
    return bad((e as Error)?.message || "Could not load photos.", 500);
  }
}

/** Delete one photo — a diner withdrew consent, or it is not fit to post. */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const storeId = String(url.searchParams.get("storeId") || "");
  const id = String(url.searchParams.get("id") || "");
  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(id)) return bad("Bad photo id.");
  try {
    const removed = await deleteConsentedPhoto(getAdminDb(), storeId, id);
    return removed ? NextResponse.json({ ok: true }) : bad("Photo not found.", 404);
  } catch (e) {
    return bad((e as Error)?.message || "Could not delete the photo.", 500);
  }
}
