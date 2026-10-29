import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";
import { readBranchConfig, writeBranchConfig } from "@/lib/server/games/ghost-hunt-store";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** One branch's complete Ghost Hunt settings. There are no chain-wide ones. */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return bad(gate.error, gate.status);
  const storeId = String(new URL(req.url).searchParams.get("storeId") || "");
  if (!storeId) return bad("Pick a branch.");
  const cfg = await readBranchConfig(getAdminDb(), storeId);
  return NextResponse.json({ ok: true, storeId, ...cfg });
}

/** Save one branch: on/off plus all its settings. Refreshes the games-shelf summary. */
export async function PUT(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return bad(gate.error, gate.status);
  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  const storeId = String(body?.storeId || "");
  if (!storeId) return bad("Pick a branch.");
  const start = Number(body?.settings?.startsAtMs);
  const end = Number(body?.settings?.endsAtMs);
  if (!(end > start)) return bad("The end date must be after the start date.");

  const saved = await writeBranchConfig(getAdminDb(), storeId, body?.enabled === true, body?.settings, gate.caller.uid);
  return NextResponse.json({ ok: true, storeId, ...saved });
}
