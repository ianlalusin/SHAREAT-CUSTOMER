import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";
import { GAME_ID, readGhostHuntConfig } from "@/lib/server/games/ghost-hunt-store";
import { normalizeSettings } from "@/lib/games/ghost-hunt/rules";

export const runtime = "nodejs";

/** The event settings. Chain-wide, so admin-only — same reasoning as the games PUT. */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const cfg = await readGhostHuntConfig(getAdminDb());
  return NextResponse.json({
    ok: true,
    configured: cfg.configured,
    isActive: cfg.configured && cfg.scope?.isActive !== false,
    settings: cfg.settings,
  });
}

/**
 * Save settings and the on/off switch together. The run dates are mirrored to
 * the top of the doc, where the shared shelf logic reads them — that is what
 * takes the tile off the hub on the last day without anyone remembering to.
 */
export async function PUT(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;
  const settings = normalizeSettings(body?.settings);
  if (settings.endsAtMs <= settings.startsAtMs) {
    return NextResponse.json({ ok: false, error: "The end date must be after the start date." }, { status: 400 });
  }

  await getAdminDb().doc(`miniGames/${GAME_ID}`).set(
    {
      isActive: body?.isActive === true,
      startsAtMs: settings.startsAtMs,
      endsAtMs: settings.endsAtMs,
      event: settings,
      updatedAtMs: Date.now(),
      updatedByUid: gate.caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, settings });
}
