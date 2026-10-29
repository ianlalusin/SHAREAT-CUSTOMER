import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";
import { MAX_DELETES_PER_RUN, runRetention } from "@/lib/server/retention-job";

export const runtime = "nodejs";
// A full scan of the customer list plus deletions can outlast the default.
export const maxDuration = 300;

/**
 * Privacy-notice cleanup: find (and, only when asked in so many words, delete)
 * loyalty cards unused for the retention period. Platform admins only.
 *
 * A dry run is the default. A real run needs `dryRun: false` AND
 * `confirm: "DELETE"` — two separate deliberate inputs, so a stray request or
 * a half-built client can only ever produce a report.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const wantsDelete = body?.dryRun === false;
  if (wantsDelete && body?.confirm !== "DELETE") {
    return NextResponse.json({ ok: false, error: 'Type DELETE to confirm a real run.' }, { status: 400 });
  }

  try {
    const report = await runRetention(getAdminDb(), {
      dryRun: !wantsDelete,
      maxDeletes: Number(body?.maxDeletes) || MAX_DELETES_PER_RUN,
      uid: gate.caller.uid,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Cleanup failed." }, { status: 500 });
  }
}
