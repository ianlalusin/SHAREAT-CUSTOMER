"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { ArrowLeft, Loader2, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { RETENTION_YEARS_AFTER_LAST_VISIT } from "@/lib/privacy";
import type { RetentionReport } from "@/lib/server/retention-job";

/**
 * The privacy notice's promise — cards unused for the retention period are
 * deleted — run by hand. "Check" only reports; "Delete" needs DELETE typed in
 * and removes at most 200 cards per press. Run it once a month.
 */
export default function PrivacyCleanupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [report, setReport] = useState<RetentionReport | null>(null);
  const [busy, setBusy] = useState<"check" | "delete" | null>(null);
  const [confirm, setConfirm] = useState("");

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "check" : "delete");
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in.");
      const res = await fetch("/api/admin/loyalty-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(dryRun ? { dryRun: true } : { dryRun: false, confirm }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not run.");
      setReport(json.report);
      setConfirm("");
      if (!dryRun) toast({ title: `Deleted ${json.report.deleted} card(s)` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't run", description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="ghost" onClick={() => router.push("/admin")} className="-ml-2 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Card className="rounded-[2rem] border-none bg-white shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <ShieldCheck className="h-5 w-5" /> Privacy cleanup
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              The privacy notice promises to delete a Sharelebrator card, its details and leftover points after{" "}
              {RETENTION_YEARS_AFTER_LAST_VISIT} years without a visit or any use. Run a check once a month.
              Cards with a voucher on hold are never deleted. Receipts in POS are never touched.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => run(true)} disabled={!!busy} className="h-12 w-full rounded-2xl font-black">
              {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check (deletes nothing)"}
            </Button>

            {report && (
              <div className="space-y-2 rounded-2xl bg-zinc-50 p-4 text-sm">
                <p className="font-bold">
                  {report.dryRun ? "Check" : "Cleanup"} — cards last used before {report.cutoffDate}
                </p>
                <ul className="space-y-1">
                  <li>Cards looked at: {report.scanned}</li>
                  <li>Still active: {report.kept}</li>
                  <li>
                    <b>Due for deletion: {report.due}</b>
                    {report.due > 0 && ` (${report.pointsForfeited} points would go with them)`}
                  </li>
                  {!report.dryRun && <li><b>Deleted now: {report.deleted}</b></li>}
                  <li>Kept — voucher on hold: {report.skippedVoucherHeld}</li>
                  <li>Kept — no date to judge by: {report.skippedNoDate}</li>
                </ul>
                {report.sample.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-bold text-muted-foreground">Examples</p>
                    {report.sample.map((s, i) => (
                      <p key={i} className="font-mono text-xs">
                        {s.phone} · last used {s.lastActivity} · {s.points} pts
                      </p>
                    ))}
                  </div>
                )}
                {report.moreRemain && <p className="text-xs text-amber-700">More are due than one run deletes. Run again.</p>}
              </div>
            )}

            {report?.dryRun && report.due > 0 && (
              <div className="space-y-2 rounded-2xl border-2 border-dashed border-red-200 p-4">
                <p className="text-sm font-bold text-red-700">Delete these cards for good</p>
                <p className="text-xs text-muted-foreground">
                  This cannot be undone. Type DELETE, then press the button. At most 200 cards per press.
                </p>
                <div className="flex gap-2">
                  <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" className="rounded-2xl" />
                  <Button
                    variant="destructive"
                    disabled={confirm !== "DELETE" || !!busy}
                    onClick={() => run(false)}
                    className="rounded-2xl"
                  >
                    {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
