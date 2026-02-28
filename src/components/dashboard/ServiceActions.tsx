
"use client";

import { Button } from "@/components/ui/button";
import { Bell, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ServiceActions({ onServiceRequested }: { onServiceRequested: (action: string) => void }) {
  const { toast } = useToast();

  const handleAction = (label: string, icon: string) => {
    onServiceRequested(label);
    toast({
      title: `${label} Requested`,
      description: "A staff member will be with you shortly.",
    });
  };

  return (
    <section className="px-6 py-4 grid grid-cols-2 gap-4">
      <Button 
        variant="outline" 
        className="h-20 flex flex-col gap-2 rounded-2xl border-2 hover:bg-white active:bg-zinc-100 transition-all border-zinc-200"
        onClick={() => handleAction("Call Server", "bell")}
      >
        <Bell className="h-6 w-6 text-primary" />
        <span className="font-bold">Call Server</span>
      </Button>
      <Button 
        variant="outline" 
        className="h-20 flex flex-col gap-2 rounded-2xl border-2 hover:bg-white active:bg-zinc-100 transition-all border-zinc-200"
        onClick={() => handleAction("Request Add-ons", "plus")}
      >
        <PlusCircle className="h-6 w-6 text-accent" />
        <span className="font-bold">Request Add-ons</span>
      </Button>
    </section>
  );
}
