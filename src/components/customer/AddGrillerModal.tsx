"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Flame, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { getAuth } from "firebase/auth";

// Real photo not supplied yet — drop it in at this path and it renders
// automatically, no code change needed (falls back to a placeholder if the
// file is missing).
const GRILLER_IMAGE_SRC = "/images/add-griller.jpg";

type GrillerSession = {
  storeId: string;
  sessionId: string;
};

export function AddGrillerModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: GrillerSession;
}) {
  const isMobile = useIsMobile();
  const handleOpenChange = (open: boolean) => {
    if (!open) props.onOpenChange(false);
  };

  const content = <AddGrillerContent onClose={() => props.onOpenChange(false)} />;

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Add Griller</DrawerTitle>
            <DrawerDescription>Add an extra griller to your table.</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Griller</DialogTitle>
          <DialogDescription>Add an extra griller to your table.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function AddGrillerContent({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [imgError, setImgError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestGriller = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/request-griller", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not send your request.");
      toast({ title: "Request sent", description: "Staff will bring your griller shortly." });
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't send request", description: e?.message ?? "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 pb-4 sm:px-0 sm:pb-0 space-y-4">
      {imgError ? (
        <div className="w-full aspect-[4/3] rounded-xl bg-muted flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Flame className="h-10 w-10" />
          <span className="text-sm font-medium">Photo coming soon</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={GRILLER_IMAGE_SRC}
          alt="Additional griller"
          onError={() => setImgError(true)}
          className="w-full aspect-[4/3] object-cover rounded-xl"
        />
      )}

      {/* This "50 pesos" copy is cosmetic. The actual charge amount is the
          live "Additional Griller" Universal Charge (Admin → Collections),
          so a future price change needs updating in both places. */}
      <p className="text-center text-base font-medium">Add additional griller for only 50 pesos.</p>

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleRequestGriller} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Request for griller
        </Button>
      </div>
    </div>
  );
}
