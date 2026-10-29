import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer, resolveGameCaller, callerStoreId } from "@/lib/server/games/auth";
import { huntStatus, readGhostHuntConfig, readRemaining, readTableTicket, readTicket } from "@/lib/server/games/ghost-hunt-store";
import { describeWindows, savedTicketStillValid } from "@/lib/games/ghost-hunt/rules";

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

    let ticket: Awaited<ReturnType<typeof readTableTicket>> = null;
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

    // A ticket this phone saved on an earlier visit: shown only while it can
    // still be claimed here (savedTicketStillValid); otherwise the phone is
    // told to forget it, so last week's or another branch's prize stops
    // showing up.
    const savedId = String(new URL(req.url).searchParams.get("saved") || "");
    // Kept apart from `ticket`, which means "THIS table won" and gates catching.
    let savedTicket: Awaited<ReturnType<typeof readTicket>> = null;
    let savedStale = false;
    if (!ticket && savedId) {
      const saved = await readTicket(db, savedId);
      if (saved && savedTicketStillValid(saved, storeId, now)) savedTicket = saved;
      else savedStale = true;
    }

    // Settings are per branch. Away from a table there is no branch, so no
    // prizes or hours to show — only that the hunt is on somewhere, until when.
    const atBranch = !!storeId;
    return NextResponse.json({
      ok: true,
      live: status.live,
      message: status.live ? null : status.message,
      theme: s.theme,
      hours: atBranch ? describeWindows(s.windows) : "at participating branches",
      endsAtMs: atBranch ? s.endsAtMs : Number(cfg.scope?.endsAtMs) || s.endsAtMs,
      prizes: atBranch ? s.prizes.filter((p) => p.perDay > 0).map((p) => ({ id: p.id, name: p.name })) : [],
      // Null away from a table: "left" only means something at a branch.
      remaining,
      hashtag: s.hashtag,
      tagHandle: s.tagHandle,
      canPlay: caller.tier === "player",
      ticket,
      savedTicket,
      savedStale,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not load the hunt." }, { status: 500 });
  }
}
