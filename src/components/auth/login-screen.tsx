"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { OrbitMark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatLockRemaining } from "@/lib/auth/lockout";
import { safeNextPath } from "@/lib/auth/next-path";
import { SITE_TAGLINE } from "@/lib/site";
import { LoginVisual } from "./login-visual";

interface LoginError {
  message: string;
  /** Epoch ms when a lockout ends. */
  lockedUntil?: number;
}

/**
 * Split-screen sign-in (desktop: visual left, card right; mobile: the visual fills the background
 * behind the card). Single owner: password only.
 */
export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { password: useId(), remember: useId(), error: useId() };

  // Warm the destination so the hand-off after sign-in doesn't flash blank.
  useEffect(() => {
    router.prefetch(next);
  }, [router, next]);

  // Lockout countdown.
  const lockedMs = error?.lockedUntil ? Math.max(0, error.lockedUntil - now) : 0;
  const lockedUntil = error?.lockedUntil;
  useEffect(() => {
    if (!lockedUntil) return;
    const t = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        // Lock over: clear the message and hand the field back.
        window.clearInterval(t);
        setError(null);
        inputRef.current?.focus();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [lockedUntil]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || lockedMs > 0) return;
    if (!password) {
      setError({ message: "Enter your password." });
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember, next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        next?: string;
        message?: string;
        retryAfterS?: number;
      };
      if (res.ok && data.ok) {
        router.replace(safeNextPath(data.next ?? next));
        router.refresh();
        return;
      }
      setPassword("");
      setError({
        message: data.message ?? "Sign-in failed. Try again.",
        lockedUntil: data.retryAfterS ? Date.now() + data.retryAfterS * 1000 : undefined,
      });
      setNow(Date.now());
      setPending(false);
      inputRef.current?.focus();
    } catch {
      setError({ message: "Couldn’t reach FIndress. Check your connection and try again." });
      setPending(false);
    }
  }

  const locked = lockedMs > 0;

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <LoginVisual className="absolute inset-0 lg:relative lg:inset-auto" />

      <div className="relative flex items-center justify-center px-4 py-12 sm:px-8">
        <form
          onSubmit={onSubmit}
          noValidate
          aria-describedby={error ? ids.error : undefined}
          className="bg-surface/95 lift lg:bg-surface w-full max-w-sm space-y-6 rounded-2xl p-7 backdrop-blur-xl sm:p-8"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <OrbitMark />
              <h1 className="font-heading text-xl leading-none">FIndress</h1>
            </div>
            <p className="text-muted-foreground text-sm">{SITE_TAGLINE}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor={ids.password} className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id={ids.password}
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                required
                disabled={locked}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error && !locked ? true : undefined}
                className="border-input bg-background/60 placeholder:text-muted-foreground focus-visible:border-screen h-11 w-full rounded-lg border pr-11 pl-3 text-sm outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                aria-controls={ids.password}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Checkbox
              id={ids.remember}
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
            />
            <label htmlFor={ids.remember} className="text-sm">
              Remember me for 30 days
            </label>
          </div>

          {error && (
            <p
              id={ids.error}
              role="alert"
              className="text-destructive text-sm"
              data-testid="login-error"
            >
              {locked
                ? `Too many wrong passwords. Try again in ${formatLockRemaining(lockedMs)}.`
                : error.message}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={pending || locked}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function LoginScreenSkeleton() {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <LoginVisual className="absolute inset-0 lg:relative lg:inset-auto" />
      <div className="relative flex items-center justify-center px-4 py-12">
        <div className="bg-surface lift h-[360px] w-full max-w-sm rounded-2xl" />
      </div>
    </div>
  );
}
