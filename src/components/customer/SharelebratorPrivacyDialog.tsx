"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Points left on the card, shown in the delete warning. */
  pointsBalance: number;
  /** Called after the card is gone, so the screen can sign out / refresh. */
  onDeleted: () => void;
}

async function post(path: string, body: Record<string, unknown>) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Session expired. Please re-enter your PIN.");
  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong. Please try again.");
  return json;
}

/**
 * "My data & privacy" (audit PRV-02a): download everything the app holds about
 * the card, or delete the card. Both ask for the password again.
 */
export function SharelebratorPrivacyDialog({ open, onOpenChange, pointsBalance, onDeleted }: Props) {
  const [dlPassword, setDlPassword] = useState("");
  const [delPassword, setDelPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (open) {
      setDlPassword("");
      setDelPassword("");
      setConfirm("");
      setDlError(null);
      setDelError(null);
      setDownloaded(false);
    }
  }, [open]);

  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    setDlError(null);
    setDownloaded(false);
    setBusy("download");
    try {
      const json = await post("/api/customer/sharelebrator/export-data", { password: dlPassword });
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sharelebrator-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDlPassword("");
      setDownloaded(true);
    } catch (err) {
      setDlError(err instanceof Error ? err.message : "Could not download your data.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setDelError(null);
    setBusy("delete");
    try {
      await post("/api/customer/sharelebrator/delete-account", { password: delPassword, confirm });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      setDelError(err instanceof Error ? err.message : "Could not delete your card.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            My data &amp; privacy
          </DialogTitle>
          <DialogDescription>
            See what we hold about you, or close your card. Both need your password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDownload} className="space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Download className="h-4 w-4" /> Download my data
          </h3>
          <p className="text-xs text-muted-foreground">
            A file with your details, points history and rewards. Save it somewhere private.
          </p>
          <Label htmlFor="dl-pw">Password</Label>
          <Input
            id="dl-pw"
            type="password"
            value={dlPassword}
            onChange={(e) => setDlPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy !== null}
          />
          {dlError && <p className="text-sm text-destructive">{dlError}</p>}
          {downloaded && <p className="text-sm text-green-600">Saved to your device.</p>}
          <Button type="submit" variant="outline" className="w-full gap-2" disabled={busy !== null || !dlPassword}>
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </Button>
        </form>

        <Separator />

        <form onSubmit={handleDelete} className="space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" /> Delete my card
          </h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>This cannot be undone.</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                Your card, password, details and points history are deleted.
                {pointsBalance > 0 && (
                  <>
                    {" "}
                    You will lose your <b>{pointsBalance.toLocaleString()} points</b>.
                  </>
                )}
              </li>
              <li>Your name and phone are removed from our logs and vouchers.</li>
              <li>Sales receipts are kept, because tax law requires it. They are not linked to your card.</li>
              <li>You cannot delete while a reward you claimed is still waiting to be used.</li>
            </ul>
          </div>
          <Label htmlFor="del-pw">Password</Label>
          <Input
            id="del-pw"
            type="password"
            value={delPassword}
            onChange={(e) => setDelPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy !== null}
          />
          <Label htmlFor="del-confirm">
            Type <b>DELETE</b> to confirm
          </Label>
          <Input
            id="del-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            disabled={busy !== null}
          />
          {delError && <p className="text-sm text-destructive">{delError}</p>}
          <Button
            type="submit"
            variant="destructive"
            className="w-full gap-2"
            disabled={busy !== null || !delPassword || confirm !== "DELETE"}
          >
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete my card for good
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
