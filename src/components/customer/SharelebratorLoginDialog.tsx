"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLinked: (name: string) => void;
}

export function SharelebratorLoginDialog({ open, onOpenChange, onLinked }: Props) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True only for a wrong password — not for "account not found", where a reset cannot help. */
  const [canAskManager, setCanAskManager] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCanAskManager(false);
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();

      const res = await fetch("/api/customer/sharelebrator/link-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ mode: "login", phone, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.code === "bad_password") setCanAskManager(true);
        throw new Error(json.error || "Failed to link.");
      }
      onLinked(json.name);
      onOpenChange(false);
      setPhone("");
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in to Sharelebrator</DialogTitle>
          <DialogDescription>Enter your credentials to link this session.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input
              type="tel"
              placeholder="09XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          {error && (
            <div className="space-y-1">
              <p className="text-sm text-destructive">{error}</p>
              {canAskManager && (
                <p className="text-xs text-muted-foreground">
                  Forgot your password? Ask our manager to reset it for you.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In & Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
