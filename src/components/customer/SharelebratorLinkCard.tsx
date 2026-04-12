"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirestore } from "@/firebase/provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, Lock, Loader2 } from "lucide-react";
import { SharelebratorLoginDialog } from "./SharelebratorLoginDialog";
import { SharelebratorSignupDialog } from "./SharelebratorSignupDialog";

interface Props {
  storeId: string;
  sessionId: string;
}

export function SharelebratorLinkCard({ storeId, sessionId }: Props) {
  const firestore = useFirestore();
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    if (!firestore || !storeId || !sessionId) return;
    const ref = doc(firestore, "stores", storeId, "activeSessions", sessionId);
    return onSnapshot(ref, (snap) => {
      const data = snap.data() as any;
      setLinkedName(data?.linkedCustomerName || null);
      setLocked(!!data?.linkedCustomerLockedAt);
      setLoading(false);
    }, () => setLoading(false));
  }, [firestore, storeId, sessionId]);

  async function handleUnlink() {
    setUnlinking(true);
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      await fetch("/api/customer/sharelebrator/unlink-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <>
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-white to-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Sharelebrator Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : locked && linkedName ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
              <Lock className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">
                Points added to <span className="font-bold">{linkedName}</span>'s account.
              </span>
            </div>
          ) : linkedName ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  Points will be added to <span className="font-bold">{linkedName}</span>'s account on checkout.
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleUnlink} disabled={unlinking} className="w-full">
                {unlinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unlink
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Link this session to your Sharelebrator card to earn points.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setLoginOpen(true)}>
                  I have a card
                </Button>
                <Button size="sm" onClick={() => setSignupOpen(true)}>
                  Create a card
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SharelebratorLoginDialog open={loginOpen} onOpenChange={setLoginOpen} onLinked={() => {}} />
      <SharelebratorSignupDialog open={signupOpen} onOpenChange={setSignupOpen} onLinked={() => {}} />
    </>
  );
}
