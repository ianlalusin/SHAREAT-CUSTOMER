"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, Loader2, RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * "Receive points": shows a short code the cardholder reads to a friend. The
 * friend types it under Transfer. It replaces typing phone numbers, so nobody
 * can probe numbers for cards (audit PRV-01). The code works once and lasts 10
 * minutes; this dialog counts down and offers a fresh one.
 */
export function SharelebratorReceiveDialog({ open, onOpenChange }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/sharelebrator/receive-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not create a code.");
      setCode(json.code);
      setExpiresAtMs(json.expiresAtMs);
      setNow(Date.now());
    } catch (e: any) {
      setCode(null);
      setError(e?.message || "Could not create a code.");
    } finally {
      setLoading(false);
    }
  }, []);

  // A fresh code every time the dialog opens; nothing lingers on screen after closing.
  useEffect(() => {
    if (open) void fetchCode();
    else {
      setCode(null);
      setError(null);
    }
  }, [open, fetchCode]);

  useEffect(() => {
    if (!open || !code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, code]);

  const left = Math.max(0, expiresAtMs - now);
  const expired = !!code && left === 0;
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5" /> Receive Points
          </DialogTitle>
          <DialogDescription>
            Read this code to your friend. They type it under <b>Transfer</b> to send you points.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center space-y-2">
          {loading && !code ? (
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          ) : code ? (
            <>
              <p
                className={`font-mono text-5xl font-black tracking-widest ${expired ? "text-muted-foreground line-through" : "text-primary"}`}
                aria-live="polite"
              >
                {code}
              </p>
              <p className="text-xs text-muted-foreground">
                {expired ? "This code has expired." : `Works once. Expires in ${mm}:${ss}.`}
              </p>
            </>
          ) : null}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={fetchCode} disabled={loading} className="flex-1 gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            New code
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
