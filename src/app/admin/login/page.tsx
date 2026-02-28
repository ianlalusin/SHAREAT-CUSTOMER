"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useFirebase } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { auth } = useFirebase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/admin");
    });
  }, [auth, router]);

  async function loginEmail(e: React.FormEvent) {
    e.preventDefault();
    setIsBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/admin");
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err?.message ?? "Check email/password.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function loginGoogle() {
    setIsBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.replace("/admin");
    } catch (err: any) {
      toast({
        title: "Google sign-in failed",
        description: err?.message ?? "Check authorized domains + Google sign-in enabled.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle>Admin Login</CardTitle>
          <CardDescription>Sign in to manage the catalog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={loginEmail} className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isBusy}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBusy}
            />
            <Button type="submit" className="w-full" disabled={isBusy || !email || !password}>
              {isBusy ? "Signing in..." : "Sign in with Email"}
            </Button>
          </form>

          <div className="text-center text-xs text-muted-foreground">or</div>

          <Button variant="outline" className="w-full" onClick={loginGoogle} disabled={isBusy}>
            Continue with Google
          </Button>

          <Button variant="ghost" className="w-full" onClick={() => router.push("/")} disabled={isBusy}>
            Back to PIN
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
