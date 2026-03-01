"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function loginEmail(e: React.FormEvent) {
    e.preventDefault();
    setIsBusy(true);
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/admin");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: err?.message ?? "Invalid credentials.",
      });
      setIsBusy(false);
    }
  }

  async function loginGoogle() {
    setIsBusy(true);
    try {
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.replace("/admin");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Google sign-in failed",
        description: err?.message ?? "Could not sign in with Google.",
      });
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <Card className="w-full max-w-md rounded-[2rem] border-none shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto bg-primary/10 text-primary p-3 rounded-2xl w-fit">
            <Shield className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-black">Admin Login</CardTitle>
          <CardDescription>Sign in with your staff account.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={loginEmail} className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              disabled={isBusy}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-2xl"
              autoComplete="email"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              disabled={isBusy}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-2xl"
              autoComplete="current-password"
            />

            <Button
              type="submit"
              className="w-full h-12 rounded-2xl font-black"
              disabled={isBusy || !email.trim() || !password}
            >
              {isBusy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              Sign in
            </Button>
          </form>

          <div className="text-center text-xs text-zinc-400 font-bold">OR</div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-2xl font-black"
            disabled={isBusy}
            onClick={loginGoogle}
          >
            Continue with Google
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-2xl"
            disabled={isBusy}
            onClick={() => router.push("/")}
          >
            Back to Customer
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
