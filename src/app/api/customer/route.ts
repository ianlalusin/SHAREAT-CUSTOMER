import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET() {
  return NextResponse.json({ ok: true, message: "customer api alive" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const contact = String(body?.contact ?? "").trim();
    const message = String(body?.message ?? "").trim();

    // Identify sender without auth:
    const table = String(body?.table ?? "").trim();         // e.g. "T12"
    const sessionId = String(body?.sessionId ?? "").trim(); // optional

    const source = String(body?.source ?? "web").trim() || "web";

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    const db = adminDb();
    const ref = await db.collection("publicCustomerRequests").add({
      name,
      contact,
      message,
      table,
      sessionId,
      status: "open",
      source,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
