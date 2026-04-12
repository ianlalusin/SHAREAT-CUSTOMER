"use client";

import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, KeyRound, UserCog } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: {
    name: string;
    address: string;
    email: string | null;
    bday: string;
  };
  onSaved: () => void;
}

export function SharelebratorProfileEditDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [email, setEmail] = useState(initial.email ?? "");
  const [bday, setBday] = useState(initial.bday);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only reset when the dialog transitions from closed → open,
  // not on every parent re-render (the `initial` object is a new
  // reference each render, which would otherwise wipe user input).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setName(initial.name);
      setAddress(initial.address);
      setEmail(initial.email ?? "");
      setBday(initial.bday);
      setError(null);
    }
    prevOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword || confirmPassword) {
      if (newPassword.length < 6) {
        setError("New password must be at least 6 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New password and confirmation do not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();

      const res = await fetch("/api/customer/sharelebrator/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          currentPassword,
          newPassword: newPassword || undefined,
          name,
          address,
          email,
          bday,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Update failed.");

      onSaved();
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
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Update Profile
          </DialogTitle>
          <DialogDescription>
            Enter your current password to save changes. Leave new password blank to keep the current one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Current Password *</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={submitting}
              placeholder="Required to save changes"
            />
          </div>

          <Separator />

          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <KeyRound className="h-4 w-4" />
            Change Password (optional)
          </div>
          <div className="space-y-1">
            <Label>New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              disabled={submitting}
              placeholder="Leave blank to keep current"
            />
          </div>
          <div className="space-y-1">
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting || !newPassword}
            />
          </div>

          <Separator />

          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-1">
            <Label>Birthday</Label>
            <Input type="date" value={bday} onChange={(e) => setBday(e.target.value)} required disabled={submitting} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
