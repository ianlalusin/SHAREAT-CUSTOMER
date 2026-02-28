
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, UtensilsCrossed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PinAccessPage() {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
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

    setIsLoading(true);
    // Simulate server PIN validation
    setTimeout(() => {
      if (pin === "123456") {
        document.cookie = "session_token=mock_session_active; path=/; max-age=3600";
        router.push("/dashboard");
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
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="mb-12 flex flex-col items-center">
        <div className="bg-primary p-4 rounded-full mb-4 shadow-lg">
          <UtensilsCrossed className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-primary tracking-tight">SharEat</h1>
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Customer Hub</p>
      </div>

      <Card className="w-full border-none shadow-none bg-transparent">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-bold">Welcome!</CardTitle>
          <CardDescription className="text-base">
            Enter the 6-character PIN provided at your table to start your session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <Input
                type="text"
                placeholder="6-DIGIT PIN"
                value={pin}
                onChange={handlePinChange}
                disabled={isLoading}
                className="text-center text-3xl h-16 tracking-[0.5em] font-bold uppercase rounded-xl border-2 focus-visible:ring-primary"
                autoFocus
              />
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-14 text-lg font-bold rounded-xl shadow-md transition-all active:scale-[0.98]"
              disabled={pin.length !== 6 || isLoading}
            >
              {isLoading ? "Validating..." : "Enter Session"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-auto text-center text-sm text-muted-foreground">
        <p>© 2024 SharEat POS Systems</p>
      </div>
    </div>
  );
}
