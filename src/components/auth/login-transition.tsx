"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
// Imported directly (it is DOM animation, not WebGL): it must be mounted before `active` flips.
import PixelSwap from "@/components/react-bits/PixelSwap";

/** The dark page background the transition lands on (dark theme --bg). */
const DARK_BG = "#0a0e16";

/**
 * Full-screen hand-off after a successful sign-in: React Bits PixelSwap from white to the dark
 * page background, then navigate. The destination is prefetched the moment sign-in succeeds, so
 * the next page paints straight over the dark panel.
 */
export function LoginTransition({ to }: { to: string }) {
  const router = useRouter();
  const [active, setActive] = useState(false);

  // Mount on white, then flip to the dark panel on the next frame so PixelSwap animates.
  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    // Safety net: never strand the owner on the overlay.
    const fallback = window.setTimeout(() => router.replace(to), 3000);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(fallback);
    };
  }, [router, to]);

  return (
    <div className="fixed inset-0 z-[300]" role="status" aria-live="polite">
      <span className="sr-only">Signed in. Opening FIndress…</span>
      <PixelSwap
        firstContent={<div className="size-full bg-white" />}
        secondContent={<div className="size-full" style={{ background: DARK_BG }} />}
        trigger="manual"
        active={active}
        onComplete={(done) => {
          if (done) router.replace(to);
        }}
        aspectRatio="auto"
        className="h-dvh w-screen"
        pixelSize={64}
        gap={0}
        pixelRadius={0}
        pixelSpin={0}
        pixelScale={0.35}
        duration={1400}
        pixelDuration={450}
        pattern="random"
        randomness={0}
        fade
      />
    </div>
  );
}
