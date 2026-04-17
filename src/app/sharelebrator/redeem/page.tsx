"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Gift, ArrowLeft } from "lucide-react";

export default function RedeemPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-zinc-50">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Gift className="h-10 w-10 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black">Feature Coming Soon</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Redeem exciting items here soon! For now, earn as much points as you can!
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    </main>
  );
}
