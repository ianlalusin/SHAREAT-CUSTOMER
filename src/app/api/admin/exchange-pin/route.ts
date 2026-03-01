import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type Body = { pin?: string };

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const pinRaw = (body.pin || "").trim().toUpperCase();
  if (!pinRaw) return bad("PIN is required.");

  // TEMP admin gate (you can replace later with adminPins collection + hashing)
  if (pinRaw !== "000000") return bad("Invalid admin code.", 403);

  const auth = getAdminAuth();

  // Synthetic admin uid; claims control Firestore rules
  const adminUid = "admin_root";

  const token = await auth.createCustomToken(adminUid, {
    admin: true,
    role: "catalog_admin",
  });

  return NextResponse.json({ ok: true, token });
}
