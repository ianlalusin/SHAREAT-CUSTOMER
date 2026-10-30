import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { checkCronSecret } from "@/lib/server/cron-auth";
import { runRetention } from "@/lib/server/retention-job";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Weekly privacy cleanup, REPORT ONLY (audit PRV-02d).
 *
 * Always a dry run: the request body is ignored and `maxDeletes` is 0, so no
 * input can turn this into a deletion. The run is saved to `retentionRuns`
 * like a manual one. Real deletions stay with a platform admin through
 * /api/admin/loyalty-retention, which needs a typed confirmation.
 */
export async function POST(req: Request) {
  const gate = checkCronSecret(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  try {
    const report = await runRetention(getAdminDb(), { dryRun: true, maxDeletes: 0, uid: "cron" });
    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Cleanup report failed." }, { status: 500 });
  }
}
