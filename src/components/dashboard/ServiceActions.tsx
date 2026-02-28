"use client";

import { Button } from "@/components/ui/button";
import { Bell, PlusCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useState } from "react";

function getSessionId(): string {
  try {
    const key = "customer_session_id";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return "";
  }
}

export function ServiceActions({
  onServiceRequested,
}: {
  onServiceRequested: (action: string) => void;
}) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const table = useMemo(() => {
    try {
      if (typeof window === 'undefined') return "";
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("table") ?? "").trim();
    } catch {
      return "";
    }
  }, []);

  async function sendRequest(label: string) {
    setIsSending(label);
    try {
      const res = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: label,
          source: "dashboard-buttons",
          table,
          sessionId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      onServiceRequested(label);

      toast({
        title: `${label} Requested`,
        description: `Your request is in the queue.`,
      });
    } catch (e: any) {
      toast({
        title: "Request failed",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(null);
    }
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Button
        variant="outline"
        className="h-24 flex flex-row items-center justify-start gap-4 rounded-[2rem] border-2 border-zinc-100 hover:border-primary hover:bg-primary/5 active:scale-[0.98] transition-all px-8 group shadow-sm bg-white"
        onClick={() => sendRequest("Call Server")}
        disabled={!!isSending}
      >
        <div className="bg-primary/10 p-3 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors">
          {isSending === "Call Server" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Bell className="h-6 w-6" />
          )}
        </div>
        <div className="text-left">
          <span className="font-black text-lg block leading-none">Call Server</span>
          <span className="text-xs text-muted-foreground font-medium">Notify your waiter</span>
        </div>
      </Button>

      <Button
        variant="outline"
        className="h-24 flex flex-row items-center justify-start gap-4 rounded-[2rem] border-2 border-zinc-100 hover:border-accent hover:bg-accent/5 active:scale-[0.98] transition-all px-8 group shadow-sm bg-white"
        onClick={() => sendRequest("Request Add-ons")}
        disabled={!!isSending}
      >
        <div className="bg-accent/10 p-3 rounded-2xl group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
          {isSending === "Request Add-ons" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <PlusCircle className="h-6 w-6" />
          )}
        </div>
        <div className="text-left">
          <span className="font-black text-lg block leading-none">Add-ons</span>
          <span className="text-xs text-muted-foreground font-medium">Order extra items</span>
        </div>
      </Button>
    </section>
  );
}
