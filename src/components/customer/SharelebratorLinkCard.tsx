"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { SharelebratorLoginDialog } from "./SharelebratorLoginDialog";
import { SharelebratorSignupDialog } from "./SharelebratorSignupDialog";

interface Props {
  storeId: string;
  sessionId: string;
}

export function SharelebratorLinkCard({ storeId: _storeId, sessionId: _sessionId }: Props) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

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
        </CardContent>
      </Card>

      <SharelebratorLoginDialog open={loginOpen} onOpenChange={setLoginOpen} onLinked={() => {}} />
      <SharelebratorSignupDialog open={signupOpen} onOpenChange={setSignupOpen} onLinked={() => {}} />
    </>
  );
}
