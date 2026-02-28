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

  // Optional: set a table number by URL like /dashboard?table=T12
  const table = useMemo(() => {
    try {
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
        description: `Queued. Ref: ${data.id}`,
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
    <section className="px-6 py-4 grid grid-cols-2 gap-4">
      <Button
        variant="outline"
        className="h-20 flex flex-col gap-2 rounded-2xl border-2 hover:bg-white active:bg-zinc-100 transition-all border-zinc-200"
        onClick={() => sendRequest("Call Server")}
        disabled={!!isSending}
      >
        {isSending === "Call Server" ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Bell className="h-6 w-6 text-primary" />
        )}
        <span className="font-bold">Call Server</span>
      </Button>

      <Button
        variant="outline"
        className="h-20 flex flex-col gap-2 rounded-2xl border-2 hover:bg-white active:bg-zinc-100 transition-all border-zinc-200"
        onClick={() => sendRequest("Request Add-ons")}
        disabled={!!isSending}
      >
        {isSending === "Request Add-ons" ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <PlusCircle className="h-6 w-6 text-accent" />
        )}
        <span className="font-bold">Request Add-ons</span>
      </Button>
    </section>
  );
}
