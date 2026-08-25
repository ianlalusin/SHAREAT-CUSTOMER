"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStoreScope } from "./StoreScope";

/**
 * The header every manager screen shares: where you are, which branch, and the
 * way back.
 *
 * The picker only appears for someone who actually holds more than one branch.
 * A manager with a single store has no choice to make, so offering one is a
 * control that can only be got wrong.
 */
export function ManagerHeader({
  title,
  subtitle,
  icon,
  backHref = "/manager",
  showStore = true,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  backHref?: string | null;
  showStore?: boolean;
}) {
  const { storeId, storeName, stores, setStoreId } = useStoreScope();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-zinc-200 hover:bg-zinc-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-black">
            {icon}
            {title}
          </h1>
          {subtitle && <p className="text-sm font-medium text-zinc-500">{subtitle}</p>}
        </div>
      </div>

      {showStore &&
        (stores.length > 1 ? (
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.storeId} value={s.storeId}>
                  {s.name || s.storeId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-zinc-500">
            Branch: <b>{storeName}</b>
          </p>
        ))}
    </div>
  );
}
