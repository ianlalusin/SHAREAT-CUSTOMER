import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function mmddyyyy(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}${dd}${yyyy}`;
}

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
    const suggestion = String(body?.suggestion || "");
    const customerName = String(body?.customerName || "");

    if (!(rating >= 1 && rating <= 5)) return bad("Invalid rating.", 400);

    const db = getAdminDb();

    // validate session + access window (same as submit-refill)
    const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
    const activeSnap = await activeRef.get();
    if (!activeSnap.exists) return bad("Session not found.", 404);

    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    const createdAtClientMs = Date.now();
    const createdByUid = String(decoded.uid || "");

    const dayKey = mmddyyyy(new Date());
    const dayCol = db.collection(`stores/${storeId}/customerFeedbackDays`);

    // simple chunk rule: max 400 feedback entries per doc
    const MAX_PER_DOC = 400;

    const entry = {
      id: db.collection("_").doc().id,
      createdAtClientMs,
      createdByUid,
      storeId,
      sessionId,
      customerName: customerName || String(active.customerName || ""),
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

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(chosenRef);
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

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
