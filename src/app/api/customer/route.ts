import { NextResponse } from "next/server";

/**
 * Minimal placeholder route so /api/customer exists.
 * Replace the response with your real logic.
 */
export async function GET() {
  return NextResponse.json({ ok: true, message: "customer api alive" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, received: body });
}
