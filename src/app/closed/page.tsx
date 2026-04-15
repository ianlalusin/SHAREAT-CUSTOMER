"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Star, Loader2, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const c = document.cookie.split(";").map((v) => v.trim());
  return decodeURIComponent(c.find((x) => x.startsWith(name + "="))?.split("=").slice(1).join("=") ?? "");
}

export default function SessionClosedPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState<string>("Sharelebrator");
  const [rating, setRating] = useState<number>(0);
  const [suggestion, setSuggestion] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const name = getCookie("session_customer");
    if (name) setCustomerName(name);
  }, []);

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  async function handleSubmit() {
    if (isSubmitting || rating === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        // Token may have been signed out or expired; submit anonymously is not allowed
        // by the API, so we cleanly send the customer back home.
        router.push("/");
        return;
      }
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/submit-feedback", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rating, suggestion, customerName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Submit failed.");
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || "Submit failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDone() {
    // Sign out + clear cookies + go home
    try {
      const auth = getAuth();
      auth.signOut();
    } catch {}
    [
      "customer_token",
      "store_id",
      "session_id",
      "session_customer",
      "session_table",
      "package_offering_id",
      "initial_flavor_ids",
      "package_name",
    ].forEach((k) => {
      document.cookie = `${k}=; path=/; max-age=0; SameSite=Lax`;
    });
    router.push("/");
  }

  // ───────── After feedback submitted ─────────
  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <Card className="w-full max-w-md border-none shadow-xl rounded-3xl">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-black">Thank you for your feedback.</h1>
            <p className="text-zinc-600">
              This helps us do better.
              <br />
              Until your next sharelebration here at SharEat!
            </p>
            <Button onClick={handleDone} className="w-full h-12 rounded-xl text-base font-bold">
              Done
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ───────── Session ended + feedback prompt ─────────
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md border-none shadow-xl rounded-3xl">
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black leading-tight">
              Thank you{customerName !== "Sharelebrator" ? `, ${customerName}` : ""}!
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Your session has ended. We are glad you sharelebrated here at SharEat.
              <br className="hidden sm:block" />
              <span className="block mt-2 font-medium text-zinc-800">
                How was your experience? Share it with us.
              </span>
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-center">Rate your experience</p>
              <div className="flex items-center justify-center gap-1">
                {stars.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    className="p-1 rounded-md hover:bg-zinc-100 active:scale-95 transition"
                    onClick={() => setRating(n)}
                  >
                    <Star
                      className={cn(
                        "h-9 w-9",
                        n <= rating ? "fill-yellow-400 text-yellow-400" : "fill-white text-zinc-300"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-700">
                {rating > 0
                  ? `Why did you give us ${rating} star${rating === 1 ? "" : "s"}?`
                  : "Anything you'd like to tell us?"}
              </p>
              <Textarea
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder="Suggestions, compliments, what we can improve…"
                className="min-h-[100px] rounded-xl"
              />
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDone}
                className="flex-1 h-12 rounded-xl"
                disabled={isSubmitting}
              >
                Skip
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={rating === 0 || isSubmitting}
                className="flex-1 h-12 rounded-xl font-bold"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
