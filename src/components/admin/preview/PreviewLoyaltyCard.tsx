"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, Settings, Send, Gift, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { MockLoyaltyCustomer, MockLedgerEntry } from "@/lib/preview/mock-data";

interface Props {
  customer: MockLoyaltyCustomer;
  ledger: MockLedgerEntry[];
  onPreviewAction: (label: string) => void;
}

/**
 * Visual twin of SharelebratorCardView, fed by mock data instead of a real
 * fetch — there is no real customer/session behind this. Redeem, Transfer,
 * Edit, and Refresh are all inert; each just reports the click upward via
 * onPreviewAction so the page can show a "preview mode" notice. No API is
 * ever called from this component.
 */
export function PreviewLoyaltyCard({ customer: c, ledger, onPreviewAction }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  function fakeRefresh() {
    setRefreshing(true);
    onPreviewAction("Refresh");
    setTimeout(() => setRefreshing(false), 400);
  }

  return (
    <div className="max-w-md mx-auto space-y-4 pb-4">
      <Card
        className="border-0 overflow-hidden relative text-white"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #3a3a3a 50%, #1a1a1a 60%, #0a0a0a 100%)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-0 bottom-0 w-[20%] -skew-x-12"
            style={{
              left: "-20%",
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
              animation: "sharelebratorCardShine 5s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`
          @keyframes sharelebratorCardShine {
            0% { left: -20%; }
            70%, 100% { left: 120%; }
          }
        `}</style>
        <CardContent className="relative p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5" fill="currentColor" />
              <span className="text-sm font-bold tracking-widest uppercase">Sharelebrator</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 h-8 w-8 p-0"
              onClick={() => onPreviewAction("Edit profile")}
              aria-label="Edit profile"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <p className="text-[10px] uppercase opacity-60 tracking-wider">Cardholder</p>
            <p className="text-2xl font-black leading-tight">{c.name}</p>
            <p className="text-sm font-mono opacity-80 mt-1">{c.phone}</p>
            {c.bday && (
              <p className="text-xs opacity-70 mt-0.5">
                Birthday: {format(new Date(c.bday), "MMMM d")}
              </p>
            )}
          </div>
          <div className="flex items-end justify-between pt-2 border-t border-white/10">
            <div>
              <p className="text-[10px] uppercase opacity-60 tracking-wider">Available Points</p>
              <p className="text-4xl font-black">{c.pointsBalance.toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPreviewAction("Redeem")}
                className="text-white hover:bg-white/10 h-8 gap-1.5 text-xs"
              >
                <Gift className="h-3.5 w-3.5" />
                Redeem
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPreviewAction("Transfer")}
                className="text-white hover:bg-white/10 h-8 gap-1.5 text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                Transfer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={fakeRefresh}
                disabled={refreshing}
                className="text-white hover:bg-white/10 h-8"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Recent Transactions</h3>
          </div>
          {ledger.length === 0 ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">
              No transactions yet. Points appear here after checkout.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">
                      {entry.createdAtMs ? format(new Date(entry.createdAtMs), "MMM d, h:mma") : "—"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{entry.type}</TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      ₱{entry.amount.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={`text-xs text-right font-mono font-bold ${
                        entry.points > 0 ? "text-green-600" : entry.points < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {entry.points > 0 ? "+" : ""}
                      {entry.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
