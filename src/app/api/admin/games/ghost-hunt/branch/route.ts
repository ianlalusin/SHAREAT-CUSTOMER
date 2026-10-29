import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";
import { readBranchOverrides, writeBranchOverrides } from "@/lib/server/games/ghost-hunt-store";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** One branch's own prizes, hours and socials. Absent fields follow the chain settings. */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return bad(gate.error, gate.status);
  const storeId = String(new URL(req.url).searchParams.get("storeId") || "");
  if (!storeId) return bad("Pick a branch.");
  return NextResponse.json({ ok: true, storeId, overrides: await readBranchOverrides(getAdminDb(), storeId) });
}

export async function PUT(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return bad(gate.error, gate.status);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storeId = String(body?.storeId || "");
  if (!storeId) return bad("Pick a branch.");
  const overrides = await writeBranchOverrides(getAdminDb(), storeId, body?.overrides, gate.caller.uid);
  return NextResponse.json({ ok: true, storeId, overrides });
}
