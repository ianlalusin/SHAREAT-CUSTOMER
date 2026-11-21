import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { loadAndValidateSessionAccess } from "@/lib/server/customer-session-access";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import { gameIdentityKey } from "@/lib/games/identity";

/**
 * Who is asking, for the games routes.
 *
 * Three tiers, because the shelf is browsable away from the restaurant but
 * playable only at a table:
 *
 *   anonymous  — no token. Browse only.
 *   member     — a Sharelebrator token. Browse only (see below).
 *   player     — a live table session. Publish and vote.
 *
 * Publishing and voting requiring a session is the owner's decision, and it has
 * a real virtue: every "Yummy" comes from somebody actually eating samgyup,
 * which is what makes the score worth anything. To open it up to members at
 * home later, give `member` a stable key and let `requirePlayer` accept it —
 * but note the brigade check has no session to compare against in that case.
 */

export type GameCaller =
  | { tier: "anonymous" }
  | { tier: "member"; phone: string }
  | {
      tier: "player";
      identityKey: string;
      participantId: string;
      storeId: string;
      sessionId: string;
    };

function bearer(req: Request): string | null {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/** Never throws — an unreadable token simply means "anonymous browser". */
export async function resolveGameCaller(req: Request): Promise<GameCaller> {
  const token = bearer(req);
  if (!token) return { tier: "anonymous" };

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    return { tier: "anonymous" };
  }

  if (decoded?.customer === true) {
    const storeId = String(decoded.storeId || "");
    const sessionId = String(decoded.sessionId || "");
    const participantId = String(decoded.participantId || "");
    const identityKey = gameIdentityKey(participantId);

    // A session token with no participant claim predates participant slots.
    // It cannot be told apart from anyone else on that session, so it browses.
    if (!storeId || !sessionId || !identityKey) return { tier: "anonymous" };
    return { tier: "player", identityKey, participantId, storeId, sessionId };
  }

  if (decoded?.loyaltyCustomer === true && decoded.phone) {
    return { tier: "member", phone: String(decoded.phone) };
  }

  return { tier: "anonymous" };
}

export type PlayerContext = {
  identityKey: string;
  storeId: string;
  sessionId: string;
  storeName: string;
  tableDisplayName: string;
  /** The name the cashier opened the table under; empty when none was given. */
  customerName: string;
};

/**
 * Resolve a caller who is allowed to publish or vote, or explain why not.
 *
 * Revalidates the session against Firestore rather than trusting the token
 * alone — a token outlives the meal, and `loadAndValidateSessionAccess` is the
 * same gate every other customer write in this app goes through.
 */
export async function requirePlayer(
  req: Request
): Promise<{ ok: true; player: PlayerContext } | { ok: false; error: string; status: number }> {
  const caller = await resolveGameCaller(req);

  if (caller.tier !== "player") {
    return {
      ok: false,
      status: 403,
      error: "Join your table to play — scan the QR or enter the PIN on your slip.",
    };
  }

  const db = getAdminDb();
  try {
    const session = await loadAndValidateSessionAccess(db, caller.storeId, caller.sessionId);
    // The session being open is not enough: a phone the cashier removed from
    // the table keeps a valid token until it expires. Same gate as ordering.
    await validateActiveParticipant(db, caller.storeId, caller.sessionId, caller.participantId);
    const storeSnap = await db.doc(`stores/${caller.storeId}`).get();
    const storeName = String(storeSnap.data()?.name || storeSnap.data()?.storeName || "SharEat");

    return {
      ok: true,
      player: {
        identityKey: caller.identityKey,
        storeId: caller.storeId,
        sessionId: caller.sessionId,
        storeName,
        tableDisplayName: session.tableDisplayName,
        customerName: String(session.customerName ?? ""),
      },
    };
  } catch (e: any) {
    return { ok: false, status: e?.httpStatus || 403, error: e?.message || "Session is no longer active." };
  }
}

/** The store a caller should see the shelf for, or null when they have no table. */
export function callerStoreId(caller: GameCaller): string | null {
  return caller.tier === "player" ? caller.storeId : null;
}
