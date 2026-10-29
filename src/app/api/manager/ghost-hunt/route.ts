import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
import {
  branchHasPin,
  isValidPin,
  listBranchDay,
  managerClaim,
  readGhostHuntConfig,
  setBranchPin,
} from "@/lib/server/games/ghost-hunt-store";
import { manilaDayKey } from "@/lib/games/ghost-hunt/rules";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Today's winners at this branch, what is left, and whether a cashier PIN is set. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const storeId = String(url.searchParams.get("storeId") || "");
  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);

  const db = getAdminDb();
  const dayParam = url.searchParams.get("day") || "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : manilaDayKey(Date.now());

  const [cfg, list, hasPin] = await Promise.all([
    readGhostHuntConfig(db),
    listBranchDay(db, storeId, day),
    branchHasPin(db, storeId),
  ]);

  const prizes = cfg.settings.prizes.map((p) => ({
    id: p.id,
    name: p.name,
    perDay: p.perDay,
    given: Number(list.issued[p.id]) || 0,
  }));

  return NextResponse.json({ ok: true, storeId, day, hasPin, prizes, winners: list.winners });
}

/** Set this branch's cashier PIN. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storeId = String(body?.storeId || "");
  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);
  if (!isValidPin(body?.pin)) return bad("The PIN must be 4–6 digits.");

  await setBranchPin(getAdminDb(), storeId, body.pin as string, gate.caller.uid);
  return NextResponse.json({ ok: true });
}

/** Mark a prize given from the manager screen — also how a locked ticket is released. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storeId = String(body?.storeId || "");
  const catchId = String(body?.catchId || "");
  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);

  const r = await managerClaim(getAdminDb(), storeId, catchId, gate.caller.uid, Date.now());
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ok: true });
}
