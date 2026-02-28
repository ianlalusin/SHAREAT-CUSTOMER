"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, UtensilsCrossed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PinAccessPage() {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9A-Z]/gi, "").toUpperCase();
    if (val.length <= 6) setPin(val);
  };

  const setCookie = (k: string, v: string) => {
    document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=21600; SameSite=Lax`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) return;

    // Admin PINs: 000000 or the specific dev pin 040592
    if (pin === "000000" || pin === "040592") {
      router.push("/admin/items");
      return;
    }

    setIsLoading(true);
    try {
      const ref = doc(firestore, "customerPins", pin);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        toast({
          variant: "destructive",
          title: "Invalid PIN",
          description: "Please check the PIN on your table placard.",
        });
        setIsLoading(false);
        return;
      }

      const x = snap.data() as any;

      const storeId = String(x.storeId ?? "");
      const sessionId = String(x.sessionId ?? pin);
      const tableDisplayName = String(x.tableDisplayName ?? "");
      const tableId = String(x.tableId ?? "");
      const packageOfferingId = String(x.packageOfferingId ?? "");
      const initialFlavorIds = Array.isArray(x.initialFlavorIds) ? x.initialFlavorIds : [];

      if (!storeId || !sessionId) {
        toast({
          variant: "destructive",
          title: "Invalid PIN data",
          description: "Missing store/session reference.",
        });
        setIsLoading(false);
        return;
      }

      setCookie("session_token", "customer_active");
      setCookie("store_id", storeId);
      setCookie("session_id", sessionId);
      setCookie("session_table", tableDisplayName || tableId);
      setCookie("package_offering_id", packageOfferingId);
      setCookie("initial_flavor_ids", initialFlavorIds.join(","));
      setCookie("session_customer", String(x.customerName ?? "Customer"));

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
          <h1 className="text-4xl font-black text-primary tracking-tight">SharEat</h1>
          <p className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px] mt-1">Customer Hub</p>
        </div>

        <Card className="w-full max-w-md border-none shadow-2xl rounded-[3rem] bg-white overflow-hidden p-4 sm:p-8">
          <CardHeader className="text-center space-y-4 pb-8">
            <CardTitle className="text-3xl font-black text-zinc-900">Welcome!</CardTitle>
            <CardDescription className="text-base text-zinc-500 font-medium">
              Enter the 6-character PIN provided at your table to start your session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="6-DIGIT PIN"
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
                disabled={pin.length !== 6 || isLoading}
              >
                {isLoading ? "Validating..." : "Enter Session"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-12 text-center">
          <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">© 2024 SharEat POS Systems</p>
        </div>
      </div>
    </div>
  );
}
