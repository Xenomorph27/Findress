"use client";

import { Loader2, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOwner } from "@/lib/hooks/use-owner";

/** Owner-only "Refresh now": runs one ingestion step through /api/ingest (POST). */
export function RefreshButton({ step, label = "Refresh now" }: { step: string; label?: string }) {
  const owner = useOwner();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (owner === false) {
    return (
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link href="/unlock?next=/sources">
          <Lock /> Unlock to refresh
        </Link>
      </Button>
    );
  }

  const run = async () => {
    setState("running");
    setMessage(null);
    try {
      const res = await fetch(`/api/ingest?source=${encodeURIComponent(step)}`, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        reports?: { step: string; items: number; error?: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(data.ok ? "done" : "error");
      setMessage(
        data.reports
          ?.map((r) => `${r.step}: ${r.error ? `failed (${r.error})` : `${r.items} items`}`)
          .join(" · ") ?? null,
      );
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={state === "running" || owner == null}
      >
        {state === "running" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {state === "running" ? "Refreshing…" : label}
      </Button>
      {message && (
        <p role="status" className="text-muted-foreground max-w-[260px] text-right text-[11px]">
          {message}
        </p>
      )}
    </div>
  );
}
