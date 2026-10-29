import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { claimWithPin, isValidPin, readTicket } from "@/lib/server/games/ghost-hunt-store";

export const runtime = "nodejs";

/**
 * The prize ticket. No session needed: the diner may have paid and closed the
 * table by the time they reach the counter. The ticket id is unguessable, and
 * handing the prize over still needs the branch's cashier PIN.
 */
export async function GET(req: Request) {
  const id = String(new URL(req.url).searchParams.get("id") || "");
  const ticket = await readTicket(getAdminDb(), id);
  if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });
  return NextResponse.json({ ok: true, ticket });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const catchId = String(body?.catchId || "");
  const pin = body?.pin;
  if (!isValidPin(pin)) return NextResponse.json({ ok: false, error: "Enter the 4–6 digit PIN." }, { status: 400 });

  try {
    const r = await claimWithPin(getAdminDb(), catchId, pin, Date.now());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not confirm." }, { status: 500 });
  }
}
