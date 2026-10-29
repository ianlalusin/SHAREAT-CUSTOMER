import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { scanForGhost } from "@/lib/server/games/ghost-hunt-store";

export const runtime = "nodejs";

/** One look around. The server decides what appears; the phone only draws it. */
export async function POST(req: Request) {
  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  try {
    const r = await scanForGhost(getAdminDb(), gate.player, Date.now());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Scan failed." }, { status: 500 });
  }
}
