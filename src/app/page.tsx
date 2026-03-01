"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, UtensilsCrossed, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuth, signInWithCustomToken } from "firebase/auth";

export default function PinAccessPage() {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9A-Z]/gi, "").toUpperCase();
    if (val.length <= 6) setPin(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim().toUpperCase();
    if (cleanPin.length < 4) return;

    // Admin shortcut PIN
    if (cleanPin === "000000") {
      router.push("/admin/login");
      return;
    }

    // Customer PIN must be 6 chars
    if (cleanPin.length !== 6) {
      toast({
        variant: "destructive",
        title: "Invalid PIN",
        description: "Customer PINs must be 6 characters.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/customer/exchange-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleanPin }),
      });

      const json = (await res.json().catch(() => ({}))) as any;

      if (!res.ok || !json?.ok) {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: json?.error ?? "Invalid PIN. Please check your table placard.",
        });
        setIsLoading(false);
        return;
      }

      // IMPORTANT: Firestore rules rely on Firebase Auth, not cookies.
      // Sign in using the custom token so requests have request.auth != null
      const auth = getAuth();
      await signInWithCustomToken(auth, String(json.token || ""));

      // Store session in cookies (for app routing/session context)
      const setCookie = (k: string, v: string) => {
        document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=21600; SameSite=Lax`;
      };

      setCookie("customer_token", String(json.token || ""));
      setCookie("store_id", String(json.storeId || ""));
      setCookie("session_id", String(json.sessionId || ""));
      setCookie("pin", cleanPin);

      // session details from projection (so dashboard + refill modal have correct scope)
      setCookie("session_customer", String(json.customerName || "Customer"));
      setCookie("session_table", String(json.tableDisplayName || json.tableId || ""));
      setCookie("package_offering_id", String(json.packageOfferingId || ""));
      setCookie("initial_flavor_ids", Array.isArray(json.initialFlavorIds) ? json.initialFlavorIds.join(",") : "");
      setCookie("package_name", String(json.packageName || ""));

      router.push("/dashboard");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message ?? "Failed to validate PIN.",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 bg-zinc-50">
      <div className="container max-w-4xl mx-auto flex flex-col items-center">
        <div className="mb-12 flex flex-col items-center">
          <div className="bg-primary p-5 rounded-full mb-4 shadow-xl ring-8 ring-primary/10">
            <UtensilsCrossed className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-5xl font-extrabold text-primary tracking-tight font-logo">SharEat</h1>
          <p className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px] mt-1">
            Customer Hub
          </p>
        </div>

        <Card className="w-full max-w-md border-none shadow-2xl rounded-[3rem] bg-white overflow-hidden p-4 sm:p-8">
          <CardHeader className="text-center space-y-4 pb-8">
            <CardTitle className="text-3xl font-black text-zinc-900">Welcome!</CardTitle>
            <CardDescription className="text-base text-zinc-500 font-medium">
              Enter your PIN to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="ENTER PIN"
                  value={pin}
                  onChange={handlePinChange}
                  disabled={isLoading}
                  className="text-center text-4xl h-20 tracking-[0.4em] font-black uppercase rounded-2xl border-zinc-100 bg-zinc-50/50 focus-visible:ring-primary focus-visible:border-primary transition-all"
                  autoFocus
                />
                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-300" />
              </div>

              <Button
                type="submit"
                className="w-full h-16 text-xl font-black rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-[0.97] bg-primary hover:bg-primary/90"
                disabled={pin.length < 4 || isLoading}
              >
                {isLoading ? <Loader2 className="animate-spin mr-2" /> : "Enter Session"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-12 text-center">
          <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">
            © Developed by Ian Lalusin 2026
          </p>
        </div>
      </div>
    </div>
  );
}
