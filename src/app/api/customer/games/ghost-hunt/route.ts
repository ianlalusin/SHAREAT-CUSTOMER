import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer, resolveGameCaller, callerStoreId } from "@/lib/server/games/auth";
import { huntStatus, readGhostHuntConfig, readRemaining, readTableTicket } from "@/lib/server/games/ghost-hunt-store";
import { describeWindows } from "@/lib/games/ghost-hunt/rules";

export const runtime = "nodejs";

/**
 * Is the hunt on, what can be won here, how much of it is left today, and —
 * for a diner at a table — the prize their table already won, so a refreshed
 * phone gets its ticket back. Open to anonymous callers, like the shelf: the
 * rules are worth reading before sitting down.
 */
export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    const caller = await resolveGameCaller(req);
    const storeId = callerStoreId(caller);
    const now = Date.now();
    const cfg = await readGhostHuntConfig(db, storeId);
    const status = huntStatus(cfg, storeId, now);
    const s = status.settings;

    let ticket = null;
    let remaining = null;
    if (caller.tier === "player") {
      const gate = await requirePlayer(req);
      if (gate.ok) {
        [ticket, remaining] = await Promise.all([
          readTableTicket(db, gate.player),
          readRemaining(db, gate.player.storeId, s, now),
        ]);
      }
    }

    return NextResponse.json({
      ok: true,
      live: status.live,
      message: status.live ? null : status.message,
      theme: s.theme,
      hours: describeWindows(s.windows),
      endsAtMs: s.endsAtMs,
      prizes: s.prizes.filter((p) => p.perDay > 0).map((p) => ({ id: p.id, name: p.name })),
      // Null away from a table: "left" only means something at a branch.
      remaining,
      hashtag: s.hashtag,
      tagHandle: s.tagHandle,
      canPlay: caller.tier === "player",
      ticket,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not load the hunt." }, { status: 500 });
  }
}
