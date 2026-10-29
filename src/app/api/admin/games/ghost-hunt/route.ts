import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";
import { GAME_ID } from "@/lib/server/games/ghost-hunt-store";
import { resolveBranchConfig } from "@/lib/games/ghost-hunt/branches";
import { eventState } from "@/lib/games/ghost-hunt/rules";

export const runtime = "nodejs";

/**
 * Every branch at a glance: on or off, dates, and whether it is running right
 * now. Settings are per branch only — edit them through ./branch.
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const db = getAdminDb();
  const [summarySnap, storesSnap, branchesSnap] = await Promise.all([
    db.doc(`miniGames/${GAME_ID}`).get(),
    db.collection("stores").limit(200).get(),
    db.collection("ghostHuntBranches").get(),
  ]);
  const summary = summarySnap.data();
  const branchDocs = new Map(branchesSnap.docs.map((d) => [d.id, d.data()]));
  const now = Date.now();

  const branches = storesSnap.docs
    .map((s) => {
      const cfg = resolveBranchConfig(summary, branchDocs.get(s.id), s.id);
      const ev = eventState(cfg.settings, now);
      return {
        storeId: s.id,
        name: String(s.data()?.name || s.data()?.storeName || s.id),
        enabled: cfg.enabled,
        runningNow: cfg.enabled && ev.live,
        status: !cfg.enabled ? "Off" : ev.live ? "Running now" : ev.message,
        theme: cfg.settings.theme,
        startsAtMs: cfg.settings.startsAtMs,
        endsAtMs: cfg.settings.endsAtMs,
        prizesPerDay: cfg.settings.prizes.reduce((a, p) => a + (p.perDay || 0), 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ ok: true, branches });
}
