import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { RATE_RULES, checkRateLimits, recordRateLimitFailures, tooManyAttempts } from "@/lib/server/rate-limit";
import { maskDisplayName } from "@/lib/server/mask-name";
import { BAD_CODE, normalizeTransferCode, peekTransferCode } from "@/lib/server/transfer-code";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Who would receive these points? The sender types a receive code their friend
 * showed them (audit PRV-01); a phone number is not accepted. Returns the
 * masked name so the sender can recognise who they meant before confirming.
 * Wrong codes are budgeted per account; a right one costs nothing.
 */
export async function POST(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }
  if (decoded.customer !== true && decoded.loyaltyCustomer !== true) return bad("Unauthorized.", 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const db = getAdminDb();
  const budget: [typeof RATE_RULES.codeGuess, string][] = [[RATE_RULES.codeGuess, String(decoded.uid || "")]];
  const gate = await checkRateLimits(db, budget);
  if (!gate.ok) return tooManyAttempts(gate.retryAfterMs);

  const code = normalizeTransferCode(body?.code);
  const phone = code ? await peekTransferCode(db, code) : null;
  const snap = phone ? await db.doc(`customers/${phone}`).get() : null;
  if (!snap?.exists) {
    await recordRateLimitFailures(db, budget);
    return bad(BAD_CODE, 404);
  }

  return NextResponse.json({ ok: true, name: maskDisplayName(String((snap.data() as any)?.name || "")) });
}
