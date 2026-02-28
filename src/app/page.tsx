"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, UtensilsCrossed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PinAccessPage() {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9A-Z]/gi, "").toUpperCase();
    if (val.length <= 6) {
      setPin(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) return;

    if (pin === "000000") {
      window.location.assign("/admin/login");
      return;
    }

    setIsLoading(true);
    // Simulate server PIN validation
    setTimeout(() => {
      if (pin === "123456" || pin === "040592") {
        document.cookie = "session_token=mock_session_active; path=/; max-age=3600";
        document.cookie = "session_table=B12; path=/; max-age=3600";
        document.cookie = "session_customer=Johnathan; path=/; max-age=3600";
        window.location.assign("/dashboard");
      } else {
        toast({
          variant: "destructive",
          title: "Invalid PIN",
          description: "Please check the PIN on your table placard.",
        });
        setIsLoading(false);
      }
    }, 1200);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 bg-zinc-50">
      <div className="mb-8 flex flex-col items-center">
        <div className="bg-primary p-5 rounded-full mb-4 shadow-xl">
          <UtensilsCrossed className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-4xl font-black text-primary tracking-tight">SharEat</h1>
        <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-[10px] mt-1">Customer Hub</p>
      </div>

      <Card className="w-full max-w-md border-none shadow-2xl bg-white rounded-[2rem]">
        <CardHeader className="text-center space-y-2 pt-10">
          <CardTitle className="text-3xl font-bold">Welcome!</CardTitle>
          <CardDescription className="text-base px-4">
            Enter the 6-character PIN provided at your table to start your session.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <Input
                type="text"
                placeholder="000000"
                value={pin}
                onChange={handlePinChange}
                disabled={isLoading}
                className="text-center text-3xl h-20 tracking-[0.5em] font-black uppercase rounded-2xl border-2 border-zinc-100 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoFocus
              />
              <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-300" />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-16 text-xl font-bold rounded-2xl shadow-lg transition-all active:scale-[0.98] bg-primary hover:bg-primary/90"
              disabled={pin.length !== 6 || isLoading}
            >
              {isLoading ? "Validating PIN..." : "Enter Session"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-12 text-center text-sm text-zinc-400">
        <p className="font-medium">© 2024 SharEat POS Systems</p>
        <p className="text-xs mt-1">v2.1.0 • Secure Session Portal</p>
      </div>
    </div>
  );
}
