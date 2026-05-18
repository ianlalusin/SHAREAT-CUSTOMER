"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { getAuth } from "firebase/auth";

const PLACEHOLDER = "put your request here, we'll send it to our staff";
const MAX_LENGTH = 500;

export function CustomerRequestModal({
  open,
  onOpenChange,
  sessionIsLocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionIsLocked?: boolean;
}) {
  const isMobile = useIsMobile();

  const handleOpenChange = (next: boolean) => {
    if (!next) onOpenChange(false);
  };

  const content = <CustomerRequestContent sessionIsLocked={sessionIsLocked} onClose={() => onOpenChange(false)} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Send a Request</DrawerTitle>
            <DrawerDescription>Type anything — our staff will receive it on the kitchen display.</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>Send a Request</DialogTitle>
          <DialogDescription>Type anything — our staff will receive it on the kitchen display.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function CustomerRequestContent({
  sessionIsLocked,
  onClose,
}: {
  sessionIsLocked?: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = text.trim();
  const isEmpty = trimmed.length === 0;
  const isTooLong = trimmed.length > MAX_LENGTH;

  async function submit() {
    if (sessionIsLocked) {
      toast({ variant: "destructive", title: "Session Locked", description: "Requests are disabled." });
      return;
    }
    if (isEmpty) {
      toast({ variant: "destructive", title: "Empty request", description: "Please type something before sending." });
      return;
    }
    if (isTooLong) {
      toast({ variant: "destructive", title: "Too long", description: `Max ${MAX_LENGTH} characters.` });
      return;
    }

    setIsSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Session expired. Please re-enter your PIN.");
      const idToken = await user.getIdToken();

      const res = await fetch("/api/customer/submit-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ text: trimmed }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to send request.");

      toast({ title: "Request sent", description: "Our staff will be with you shortly." });
      setText("");
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Unknown error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancel() {
    setText("");
    onClose();
  }

  return (
    <div className="p-4 pt-2 flex flex-col gap-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={6}
        maxLength={MAX_LENGTH + 50}
        disabled={isSubmitting || !!sessionIsLocked}
        className="resize-none min-h-[140px] text-base"
        autoFocus
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className={isTooLong ? "text-destructive font-medium" : ""}>
          {trimmed.length} / {MAX_LENGTH}
        </span>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={cancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isSubmitting || !!sessionIsLocked || isEmpty || isTooLong}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
