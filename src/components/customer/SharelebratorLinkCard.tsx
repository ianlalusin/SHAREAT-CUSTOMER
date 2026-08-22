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
  /** Called after a successful login/signup link so the parent can refresh. */
  onLinked?: (name: string) => void;
  /**
   * The cardholder's name when the session already belongs to another diner.
   * Only changes the copy: promising points this session cannot give would be
   * a lie, since linking will be refused while their card holds the seat.
   */
  takenBy?: string | null;
  /** Their own card, when they signed in without claiming the session. */
  onCard?: (card: any) => void;
}

export function SharelebratorLinkCard({ storeId: _storeId, sessionId: _sessionId, onLinked, takenBy, onCard }: Props) {
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
              {takenBy
                ? "Open your own card to check your points. This meal will keep earning for the card already linked."
                : "Link this session to your Sharelebrator card to earn points."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => setLoginOpen(true)}>
                {takenBy ? "View my card" : "I have a card"}
              </Button>
              <Button size="sm" onClick={() => setSignupOpen(true)}>
                Create a card
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SharelebratorLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onLinked={(name) => onLinked?.(name)}
        linkToSession={!takenBy}
        onCard={onCard}
      />
      <SharelebratorSignupDialog
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onLinked={(name) => onLinked?.(name)}
        linkToSession={!takenBy}
        onCard={onCard}
      />
    </>
  );
}
