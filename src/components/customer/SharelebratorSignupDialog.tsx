"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { BUSINESS_NAME } from "@/lib/privacy";

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
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
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
          acceptPrivacy,
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
            <Label>Address (optional, for your receipt)</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Birthday * (for birthday treats)</Label>
            <Input type="date" value={bday} onChange={(e) => setBday(e.target.value)} required disabled={submitting} />
          </div>
          {/*
            Consent is asked before anything is collected, in plain words, with
            the full notice one tap away. The server refuses a signup without it
            and stamps the notice version on the new account.
          */}
          <label className="flex items-start gap-2 rounded-lg bg-zinc-50 p-3 text-xs leading-snug text-zinc-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={acceptPrivacy}
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
              disabled={submitting}
              required
            />
            <span>
              I agree that {BUSINESS_NAME} keeps my details to run my Sharelebrator card, as explained in the{" "}
              <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-primary underline">
                Privacy Notice
              </a>
              . I can ask to see, fix or delete them anytime.
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting || !acceptPrivacy} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Card & Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
