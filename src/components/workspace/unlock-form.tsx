"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { OrbitMark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refreshBookmarks } from "@/lib/hooks/use-bookmarks";
import { resetOwner } from "@/lib/hooks/use-owner";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/workspace";
}

export function UnlockForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Couldn’t unlock.");
      resetOwner();
      void refreshBookmarks();
      // Full navigation: the client router may hold the pre-unlock redirect for this URL.
      window.location.assign(safeNext(params.get("next")));
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="glass border-hairline w-full max-w-sm space-y-5 rounded-2xl border p-7"
    >
      <div className="space-y-2">
        <OrbitMark className="size-7" />
        <h1 className="font-display text-4xl">Unlock FIndress</h1>
        <p className="text-muted-foreground text-sm">
          Your workspace, notes, bookmarks and the assistant are private. Browsing stays open to
          everyone.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "unlock-error" : undefined}
        />
        {error && (
          <p id="unlock-error" role="alert" className="text-heat-hot text-sm">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending || !password}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Unlock
      </Button>
    </form>
  );
}
