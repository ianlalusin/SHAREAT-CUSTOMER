import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";
import { loadLoyaltyCard } from "@/lib/server/loyalty-card";
import { CLEARED_LINKER_FIELDS, decideDinerLink } from "@/lib/server/session-link";

export const runtime = "nodejs";

function bad(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: msg, ...(code ? { code } : {}) }, { status });
}

/**
 * Set false to authenticate WITHOUT claiming the session.
 *
 * A table holds one card, so a diner sitting with someone who already linked
 * theirs could otherwise never reach their own points at all. Same credential
 * checks, same audit logs, no write to the session — they get their card back
 * read-only.
 */
type NoLink = { linkToSession?: boolean };

type LoginBody = NoLink & {
  mode: "login";
  phone: string;
  password: string;
};

type SignupBody = NoLink & {
  mode: "signup";
  phone: string;
  password: string;
  name: string;
  address: string;
  email?: string;
  bday: string;
};

type Body = LoginBody | SignupBody;

export async function POST(req: Request) {
  // Verify the session token (customer:true with storeId + sessionId)
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing session token.", 401);

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid session token.", 401);
  }

  if (decoded.customer !== true) return bad("Not a customer session.", 403);
  const storeId = String(decoded.storeId || "");
  const sessionId = String(decoded.sessionId || "");
  if (!storeId || !sessionId) return bad("Session claims missing storeId/sessionId.", 403);
  // Which phone at the table linked the card. The link itself is on the shared
  // session doc, so without this there is no way to tell the cardholder apart
  // from the strangers sitting with them — and /me handed everyone the card.
  const participantId = String((decoded as any).participantId || "");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const phone = normalizePhone(body.phone);
  if (!phone) return bad("Invalid phone number.");

  const password = String(body.password || "");
  if (password.length < 6) return bad("Password must be at least 6 characters.");

  const db = getAdminDb();
  const customerRef = db.doc(`customers/${phone}`);

  // First-come lock: if this session is already linked to a different phone,
  // reject early. The existing linker must unlink before a different card can
  // claim this session. Re-linking with the same phone is idempotent-OK — and
  // when the existing link is the cashier's, the same phone upgrades it to a
  // diner link (see decideDinerLink). This is only an early exit: bcrypt runs
  // after it, so the write below re-applies the rule inside a transaction.
  const linkToSession = body.linkToSession !== false;

  const activeRefPreCheck = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  // Skipped entirely when not claiming the table — one less read, and there is
  // no first-come rule to apply.
  const preCheckSnap = linkToSession ? await activeRefPreCheck.get() : null;
  if (linkToSession && preCheckSnap?.exists) {
    const verdict = decideDinerLink(preCheckSnap.data(), phone);
    if (!verdict.ok) return bad(verdict.error, verdict.status);
  }

  // Resolve customer (login or signup)
  let customerName: string;

  // Fetch store name once (used in logs for both modes)
  let storeName = storeId;
  try {
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    storeName = (storeSnap.data() as any)?.name || storeId;
  } catch {}

  if (body.mode === "login") {
    const snap = await customerRef.get();
    if (!snap.exists) {
      await writeLoyaltyLog({
        type: "login_failed",
        phone,
        customerName: "",
        actorUid: phone,
        source: "in_session",
        storeId,
        storeName,
        sessionId,
      });
      return bad("Account not found.", 401);
    }
    const data = snap.data() as any;
    const matchPw = await bcrypt.compare(password, data.passwordHash || "");
    if (!matchPw) {
      await writeLoyaltyLog({
        type: "login_failed",
        phone,
        customerName: data.name || "",
        actorUid: phone,
        source: "in_session",
        storeId,
        storeName,
        sessionId,
      });
      return bad("Incorrect phone or password.", 401, "bad_password");
    }
    customerName = data.name;
    await writeLoyaltyLog({
      type: "login",
      phone,
      customerName,
      actorUid: phone,
      source: "in_session",
      storeId,
      storeName,
      sessionId,
    });
  } else if (body.mode === "signup") {
    const existing = await customerRef.get();
    if (existing.exists) return bad("Account with this phone already exists. Try Log In.", 409);

    const name = String(body.name || "").trim();
    if (!name) return bad("Name is required.");
    const address = String(body.address || "").trim();
    if (!address) return bad("Address is required.");
    const bday = String(body.bday || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bday)) return bad("Birthday must be YYYY-MM-DD.");
    const bdayDate = new Date(bday + "T00:00:00");
    if (isNaN(bdayDate.getTime()) || bdayDate.toISOString().slice(0, 10) !== bday) return bad("Invalid date.");
    const email = body.email ? String(body.email).trim() : undefined;

    const passwordHash = await bcrypt.hash(password, 10);
    await customerRef.set({
      phone,
      passwordHash,
      name,
      address,
      email: email ?? null,
      bday,
      pointsBalance: 0,
      visitCount: 0,
      storeVisits: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Audit log (individual + daily projection)
    await writeLoyaltyLog({
      type: "account_created",
      phone,
      customerName: name,
      actorUid: decoded.uid || phone,
      source: "in_session",
      storeId,
      storeName,
      sessionId,
    });

    // Global aggregate projection
    await db.doc("loyaltyStats/global").set(
      {
        totalAccounts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    customerName = name;
  } else {
    return bad("Unknown mode.");
  }

  // Authenticated, but not claiming the table.
  if (!linkToSession) {
    const card = await loadLoyaltyCard(db, phone);
    if (!card) return bad("Account not found.", 404);

    /**
     * They just proved they own the card this session is already linked to, so
     * they are not a stranger at the table — they ARE the cardholder.
     *
     * `participantId` is derived from a device id in localStorage, so signing
     * out and back in mints a new one. Identity by participant alone therefore
     * locked the real cardholder out of their own card after a logout, and told
     * them their meal was earning for someone with their own name. The card is
     * the identity here; the participant is only a shortcut for it.
     *
     * Re-bind so /me recognises this device from now on. Skipped once the
     * session is locked — the bill is settled and nothing about the link should
     * move — but they still get the card back, having proved it is theirs.
     */
    const ownerSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    const ownerData = ownerSnap.exists ? (ownerSnap.data() as any) : null;
    const isSessionCardholder = !!ownerData && ownerData.linkedCustomerPhone === phone;

    if (isSessionCardholder && !ownerData.linkedCustomerLockedAt && participantId) {
      // Also upgrades a cashier link to a diner link: they proved the card.
      const rebind = { linkedByParticipantId: participantId, ...CLEARED_LINKER_FIELDS };
      const batch = db.batch();
      batch.update(db.doc(`stores/${storeId}/activeSessions/${sessionId}`), rebind);
      const sSnap = await db.doc(`stores/${storeId}/sessions/${sessionId}`).get();
      if (sSnap.exists) batch.update(db.doc(`stores/${storeId}/sessions/${sessionId}`), rebind);
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      phone,
      name: customerName,
      // True when this IS the session's card: the client should drop the
      // read-only view and show the real one.
      linked: isSessionCardholder,
      card,
    });
  }

  // Write link to session. Re-check "first card wins" at commit time: bcrypt
  // (and the pre-check above) ran earlier, so another card — a cashier's, say —
  // may have claimed the session since.
  const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  const sessionRef = db.doc(`stores/${storeId}/sessions/${sessionId}`);

  const linkData = {
    linkedCustomerPhone: phone,
    linkedCustomerName: customerName,
    linkedByParticipantId: participantId || null,
    // A diner link is never "via cashier".
    ...CLEARED_LINKER_FIELDS,
  };

  const rejected = await db.runTransaction(async (tx: any) => {
    const activeSnap = await tx.get(activeRef);
    const sessionSnap = await tx.get(sessionRef);
    if (activeSnap.exists) {
      const verdict = decideDinerLink(activeSnap.data(), phone);
      if (!verdict.ok) return verdict;
    }
    if (activeSnap.exists) tx.update(activeRef, linkData);
    if (sessionSnap.exists) tx.update(sessionRef, linkData);
    return null;
  });
  if (rejected) return bad(rejected.error, rejected.status);

  return NextResponse.json({ ok: true, phone, name: customerName });
}
