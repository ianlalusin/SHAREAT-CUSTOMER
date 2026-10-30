"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, CheckCircle2, Loader2, Send, User } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  senderBalance: number;
  onTransferred: () => void;
}

type Step = "form" | "confirm" | "success";

export function SharelebratorTransferDialog({ open, onOpenChange, senderBalance, onTransferred }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [code, setCode] = useState("");
  const [points, setPoints] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("form");
    setCode("");
    setPoints("");
    setRecipientName("");
    setError(null);
    setLoading(false);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function getToken() {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Session expired. Please re-enter your PIN.");
    return user.getIdToken();
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (cleanCode.length !== 6) { setError("Enter the 6-character code your friend sees under Receive."); return; }

    const pts = parseInt(points, 10);
    if (!pts || pts <= 0) { setError("Enter a valid number of points."); return; }
    if (pts > 50) { setError("Maximum 50 points per transfer (daily send limit)."); return; }
    if (pts > senderBalance) { setError(`You only have ${senderBalance} points.`); return; }

    setLoading(true);
    try {
      const idToken = await getToken();
      const res = await fetch("/api/customer/sharelebrator/lookup-recipient", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ code: cleanCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "That code did not work.");
      }
      setCode(cleanCode);
      setRecipientName(json.name);
      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTransfer() {
    setError(null);
    setLoading(true);
    try {
      const idToken = await getToken();
      const res = await fetch("/api/customer/sharelebrator/transfer-points", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ recipientCode: code, points: parseInt(points, 10) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Transfer failed.");
      }
      setStep("success");
      onTransferred();
    } catch (err: any) {
      setError(err.message || "Transfer failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" /> Transfer Points
              </DialogTitle>
              <DialogDescription>
                Ask your friend to tap <b>Receive</b> on their card and read you the code.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleLookup} className="space-y-3">
              <div className="space-y-1">
                <Label>Your friend&apos;s code</Label>
                <Input
                  placeholder="ABC-DEF"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  className="font-mono tracking-widest text-center text-lg uppercase"
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">Codes work once and expire after 10 minutes.</p>
              </div>
              <div className="space-y-1">
                <Label>Points to Send</Label>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  min={1}
                  max={50}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Available: <b>{senderBalance.toLocaleString()}</b> pts &middot; Max <b>50</b> pts/day
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={loading} className="w-full gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Next
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Transfer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-xl">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">{recipientName}</p>
                </div>
              </div>
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Sending</p>
                <p className="text-3xl font-black text-primary">{parseInt(points, 10).toLocaleString()} pts</p>
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => { setStep("form"); setError(null); }} disabled={loading} className="flex-1">
                Back
              </Button>
              <Button onClick={handleTransfer} disabled={loading} className="flex-1 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirm
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <>
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="text-lg font-black">Transfer Complete</h3>
              <p className="text-sm text-muted-foreground text-center">
                <b>{parseInt(points, 10).toLocaleString()} points</b> sent to <b>{recipientName}</b>
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)} className="w-full">Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
