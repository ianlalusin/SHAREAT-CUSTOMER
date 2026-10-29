import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { catchGhost } from "@/lib/server/games/ghost-hunt-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const spawnId = String((body as any)?.spawnId || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(spawnId)) {
    return NextResponse.json({ ok: false, error: "That ghost is gone." }, { status: 400 });
  }

  try {
    const r = await catchGhost(getAdminDb(), gate.player, spawnId, Date.now());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Catch failed." }, { status: 500 });
  }
}
