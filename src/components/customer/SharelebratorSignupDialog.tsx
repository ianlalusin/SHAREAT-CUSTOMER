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
  /** False when another diner's card already holds this session. */
  linkToSession?: boolean;
  /** The new (empty) card, returned only in no-link mode. */
  onCard?: (card: any) => void;
}

export function SharelebratorSignupDialog({ open, onOpenChange, onLinked, linkToSession = true, onCard }: Props) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [bday, setBday] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();

      const res = await fetch("/api/customer/sharelebrator/link-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          mode: "signup",
          linkToSession,
          phone,
          password,
          name,
          address,
          email: email || undefined,
          bday,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to create account.");
      if (linkToSession) onLinked(json.name);
      else onCard?.(json.card);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a Sharelebrator Card</DialogTitle>
          <DialogDescription>Instant — no email verification needed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Phone *</Label>
            <Input type="tel" placeholder="09XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Password * (min 6)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Address *</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Birthday *</Label>
            <Input type="date" value={bday} onChange={(e) => setBday(e.target.value)} required disabled={submitting} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Card & Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
