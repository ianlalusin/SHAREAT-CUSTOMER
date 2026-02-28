
"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Clock, Check, X, Timer } from "lucide-react";

export type RequestStatus = "queued" | "accepted" | "preparing" | "served" | "rejected";

export interface RequestRecord {
  id: string;
  item: string;
  timestamp: string;
  status: RequestStatus;
}

const statusConfig: Record<RequestStatus, { label: string; color: string; icon: any }> = {
  queued: { label: "Queued", color: "bg-slate-100 text-slate-700", icon: Clock },
  accepted: { label: "Accepted", color: "bg-blue-100 text-blue-700", icon: Check },
  preparing: { label: "Preparing", color: "bg-yellow-100 text-yellow-700", icon: Timer },
  served: { label: "Served", color: "bg-green-100 text-green-700", icon: Check },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: X },
};

export function RequestHistory({ requests }: { requests: RequestRecord[] }) {
  return (
    <section className="px-6 py-8 pb-24">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
        <History className="h-5 w-5 text-muted-foreground" />
        Recent Activity
      </h3>
      
      {requests.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-zinc-200">
          <p className="text-muted-foreground italic">No requests made yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const config = statusConfig[req.status];
            const StatusIcon = config.icon;
            
            return (
              <div 
                key={req.id} 
                className="bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border border-zinc-50"
              >
                <div className="flex-1">
                  <h4 className="font-bold text-sm">{req.item}</h4>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                    {req.timestamp}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border-none ${config.color}`}>
                    {config.label.toUpperCase()}
                  </Badge>
                  {req.status === "preparing" && (
                    <div className="w-16 h-1 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 animate-pulse-subtle w-3/4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
