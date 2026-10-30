import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { resolveCardholder } from "@/lib/server/cardholder";
import { RATE_RULES, consumeRateLimits, tooManyAttempts } from "@/lib/server/rate-limit";
import { formatTransferCode, issueTransferCode } from "@/lib/server/transfer-code";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * "Receive points": mint a short-lived code the cardholder can show a friend.
 * The friend types the code to send points; no phone number is ever typed, so
 * nobody can probe numbers for cards (audit PRV-01). The reply carries the code
 * and its expiry only.
 */
export async function POST(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }

  const db = getAdminDb();
  const who = await resolveCardholder(db, decoded);
  if (!who.ok) return bad(who.message, who.status);

  const gate = await consumeRateLimits(db, [[RATE_RULES.receiveCode, who.phone]]);
  if (!gate.ok) return tooManyAttempts(gate.retryAfterMs);

  try {
    const { code, expiresAtMs } = await issueTransferCode(db, who.phone);
    return NextResponse.json({ ok: true, code: formatTransferCode(code), expiresAtMs });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not create a code.", 500);
  }
}
