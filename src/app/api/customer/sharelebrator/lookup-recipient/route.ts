import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import { RATE_RULES, consumeRateLimits, tooManyAttempts } from "@/lib/server/rate-limit";
import { maskDisplayName } from "@/lib/server/mask-name";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }

  if (decoded.customer !== true && decoded.loyaltyCustomer !== true) {
    return bad("Unauthorized.", 403);
  }

  // The phone travels in the body, never the URL: URLs are kept in access logs,
  // browser history and referrers (audit PRV-01).
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }
  const phone = normalizePhone(body?.phone);
  if (!phone) return bad("Invalid phone number format.");

  const db = getAdminDb();
  // Any signed-in account can ask about any phone, so each one gets a budget —
  // enough to fix a typo or two, not enough to walk a list of numbers.
  const gate = await consumeRateLimits(db, [[RATE_RULES.lookupCaller, String(decoded.uid || "")]]);
  if (!gate.ok) return tooManyAttempts(gate.retryAfterMs);

  const snap = await db.doc(`customers/${phone}`).get();
  if (!snap.exists) return bad("No account found for this number.", 404);

  const data = snap.data() as any;
  return NextResponse.json({
    ok: true,
    // Masked: the sender only needs to recognise who they meant.
    name: maskDisplayName(String(data.name || "")),
  });
}
