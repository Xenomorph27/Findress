"use client";

import { cn } from "@/lib/utils";

/**
 * The visual half of the login screen. Static fallback: a deep, faintly lit panel in the login
 * accent. (The WebGL layer is added on top of this in Part 3.)
 */
export function LoginVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden bg-[#05070c]", className)}
      style={{
        backgroundImage:
          "radial-gradient(80% 60% at 30% 20%, color-mix(in oklab, var(--screen) 22%, transparent), transparent 70%), radial-gradient(70% 50% at 80% 90%, color-mix(in oklab, var(--aurora-2) 14%, transparent), transparent 70%)",
      }}
    />
  );
}
