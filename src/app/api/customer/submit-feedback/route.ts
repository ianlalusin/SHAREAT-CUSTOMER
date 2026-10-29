import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * The Manila calendar day, MMDDYYYY. It used to read the server clock, and the
 * host runs in UTC — so feedback left before 8 AM Manila was filed under the
 * previous day (audit STB-03).
 */
function mmddyyyy(nowMs = Date.now()) {
  const d = new Date(nowMs + 8 * 3600_000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${mm}${dd}${yyyy}`;
}

/** Bounds that keep a 300-entry day chunk far below Firestore's 1 MiB document limit. */
const MAX_SUGGESTION_CHARS = 1000;
const MAX_NAME_CHARS = 80;

// Collection: stores/{storeId}/customerFeedbackDays/{MMDDYYYY or MMDDYYYY-01}
// Document fields: dayKey, chunkIndex, count, feedbacks[]
export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const idToken = m[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    if ((decoded as any).customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);

    const body = await req.json().catch(() => ({}));
    const rating = Number(body?.rating || 0);
    const suggestion = String(body?.suggestion || "").trim();
    const customerName = String(body?.customerName || "").trim().slice(0, MAX_NAME_CHARS);

    if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return bad("Invalid rating.", 400);
    if (suggestion.length > MAX_SUGGESTION_CHARS) {
      return bad(`Please keep your suggestion under ${MAX_SUGGESTION_CHARS} characters.`, 400);
    }

    const db = getAdminDb();

    // Look up the session — it may live in activeSessions (still in progress)
    // OR closedSessions (cashier finalised payment). Either is acceptable for
    // feedback submission since the customer token still proves they were a
    // legitimate user of this session.
    let active: any = null;
    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (activeSnap.exists) {
      active = activeSnap.data();
    } else {
      const closedSnap = await db.doc(`stores/${storeId}/closedSessions/${sessionId}`).get();
      if (closedSnap.exists) {
        active = closedSnap.data();
      }
    }
    if (!active) return bad("Session not found.", 404);

    const createdAtClientMs = Date.now();
    const createdByUid = String(decoded.uid || "");

    const dayKey = mmddyyyy();
    const dayCol = db.collection(`stores/${storeId}/customerFeedbackDays`);

    // simple chunk rule: max 400 feedback entries per doc
    const MAX_PER_DOC = 300;

    const entry = {
      id: db.collection("_").doc().id,
      createdAtClientMs,
      createdByUid,
      storeId,
      sessionId,
      customerName: customerName || String(active.customerName || "").slice(0, MAX_NAME_CHARS),
      rating,
      suggestion,
    };

    // Find latest chunk by checking base doc then -01 ... -20 (cheap)
    // We keep it deterministic and simple.
    let chosenId = dayKey;
    let chosenChunkIndex = 0;

    for (let i = 0; i <= 20; i++) {
      const docId = i === 0 ? dayKey : `${dayKey}-${String(i).padStart(2, "0")}`;
      const ref = dayCol.doc(docId);
      const snap = await ref.get();
      if (!snap.exists) {
        chosenId = docId;
        chosenChunkIndex = i;
        break;
      }
      const data = snap.data() as any;
      const count = Number(data?.count || (Array.isArray(data?.feedbacks) ? data.feedbacks.length : 0) || 0);
      if (count < MAX_PER_DOC) {
        chosenId = docId;
        chosenChunkIndex = i;
        break;
      }
      // else continue to next chunk
    }

    const chosenRef = dayCol.doc(chosenId);
    // One feedback per diner per meal: repeat submits used to stack up and
    // skew the ratings. The marker is written in the same transaction as the
    // entry, so a double tap cannot slip two in. Keyed by participant when the
    // token has one (each phone at the table may rate), else by the token uid.
    const who = String((decoded as any).participantId || createdByUid || "anon");
    const markRef = db.doc(`stores/${storeId}/customerFeedbackMarks/${sessionId}_${who}`);
    let duplicate = false;

    await db.runTransaction(async (tx) => {
      const [snap, mark] = await Promise.all([tx.get(chosenRef), tx.get(markRef)]);
      if (mark.exists) {
        duplicate = true;
        return;
      }
      tx.set(markRef, { storeId, sessionId, createdAtClientMs, dayKey });
      if (!snap.exists) {
        tx.set(
          chosenRef,
          {
            dayKey,
            chunkIndex: chosenChunkIndex,
            storeId,
            count: 1,
            feedbacks: [entry],
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: false }
        );
        return;
      }

      const data = snap.data() as any;
      const count = Number(data?.count || (Array.isArray(data?.feedbacks) ? data.feedbacks.length : 0) || 0);
      if (count >= MAX_PER_DOC) {
        throw new Error("Feedback day chunk is full. Try again.");
      }

      const feedbacks = Array.isArray(data.feedbacks) ? [...data.feedbacks, entry] : [entry];

      tx.set(
        chosenRef,
        {
          count: count + 1,
          feedbacks,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    // A repeat is answered as success: the diner already left their feedback.
    return NextResponse.json({ ok: true, duplicate });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
