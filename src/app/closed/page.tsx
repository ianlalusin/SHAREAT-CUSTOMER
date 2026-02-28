
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, Info } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SessionClosedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full text-center border-none shadow-none bg-transparent">
        <CardHeader className="space-y-4">
          <div className="mx-auto w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center">
            <Info className="w-10 h-10 text-zinc-400" />
          </div>
          <CardTitle className="text-3xl font-bold">Session Closed</CardTitle>
          <CardDescription className="text-lg">
            This session has expired or been finalized by our team. We hope you enjoyed your meal!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <p className="text-muted-foreground">
            To start a new session, please ask your server for a new table PIN.
          </p>
          <Button 
            className="w-full h-14 text-lg font-bold rounded-xl"
            onClick={() => router.push("/")}
          >
            <LogIn className="mr-2 h-5 w-5" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
