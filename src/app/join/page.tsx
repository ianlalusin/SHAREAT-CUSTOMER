"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOrCreateDeviceId } from "@/lib/device-id";

const ERROR_MESSAGES: Record<string, string> = {
  "Join token expired.": "This QR code has expired. Please ask staff for a new PIN slip.",
  "Session is full. Maximum participants reached.": "This session is full. Please ask staff if a seat is available.",
  "Customer access has been disabled.": "Customer access for this session has been disabled.",
  "Customer access expired.": "This session's customer access has expired.",
  "This QR code is no longer valid. Please use the latest printed slip.": "This QR code is outdated. Please scan the latest printed slip.",
};

function JoinPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"joining" | "error" | "redirecting">("joining");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("t");
    if (!token) {
      setStatus("error");
      setErrorMessage("No join token found in URL. Please scan the QR code on your table slip.");
      return;
    }

    async function join() {
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch("/api/customer/exchange-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, deviceId }),
        });

        const json = (await res.json().catch(() => ({}))) as any;

        if (!res.ok || !json?.ok) {
          const rawError: string = json?.error ?? "Failed to join session.";
          setErrorMessage(ERROR_MESSAGES[rawError] ?? rawError);
          setStatus("error");
          return;
        }

        const auth = getAuth();
        await signInWithCustomToken(auth, String(json.token || ""));

        const setCookie = (k: string, v: string) => {
          document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=21600; SameSite=Lax`;
        };

        setCookie("customer_token", String(json.token || ""));
        setCookie("store_id", String(json.storeId || ""));
        setCookie("session_id", String(json.sessionId || ""));
        setCookie("session_customer", String(json.customerName || "Customer"));
        setCookie("session_table", String(json.tableDisplayName || json.tableId || ""));
        setCookie("package_offering_id", String(json.packageOfferingId || ""));
        setCookie("initial_flavor_ids", Array.isArray(json.initialFlavorIds) ? json.initialFlavorIds.join(",") : "");
        setCookie("package_name", String(json.packageName || ""));

        setStatus("redirecting");
        router.push("/dashboard");
      } catch (e: any) {
        setErrorMessage(e?.message ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
    }

    join();
  }, [router, searchParams]);

  if (status === "joining" || status === "redirecting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 px-4">
        <div className="flex flex-col items-center gap-4">
          <img src="/icons/logo.png" alt="SharEat" className="w-20 h-20 rounded-full object-contain shadow-xl" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-zinc-500 font-medium text-sm">
            {status === "redirecting" ? "Taking you to your session…" : "Joining your session…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 px-6">
      <Card className="w-full max-w-md border-none shadow-2xl rounded-[3rem] bg-white overflow-hidden p-4 sm:p-8">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="flex justify-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-black text-zinc-900">Unable to Join</CardTitle>
          <CardDescription className="text-base text-zinc-500">{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            className="w-full h-14 text-lg font-black rounded-2xl"
            onClick={() => router.push("/")}
          >
            Enter PIN Manually
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 rounded-2xl"
            onClick={() => router.back()}
          >
            Go Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinPageInner />
    </Suspense>
  );
}
