import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const pinRaw = String(body.pin || "").trim().toUpperCase();
  if (!pinRaw) return bad("PIN is required.");

  const db: any = getAdminDb();

  const projectId =
    (db as any)?._settings?.projectId ||
    (db as any)?.app?.options?.projectId ||
    null;

  try {
    const pinRef = db.doc(`pinRegistry/${pinRaw}`);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) {
      return NextResponse.json({ ok: true, projectId, pin: pinRaw, exists: false });
    }

    const data = pinSnap.data() as any;

    return NextResponse.json({
      ok: true,
      projectId,
      pin: pinRaw,
      exists: true,
      storeId: String(data.storeId || ""),
      sessionId: String(data.sessionId || ""),
      status: String(data.status || ""),
      expiresAtMs: Number(data.expiresAtMs || 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, projectId, error: e?.message || "read failed" }, { status: 500 });
  }
}
