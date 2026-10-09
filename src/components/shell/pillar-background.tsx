"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useTheme } from "next-themes";
import { useDeferredStart } from "@/lib/hooks/use-deferred-start";
import { useWebGLMode } from "@/lib/hooks/use-webgl";

// three.js + WebGL: browser only, fetched after the page is interactive.
const LightPillar = dynamic(() => import("@/components/react-bits/LightPillar"), { ssr: false });

/**
 * Light behind data-heavy pages is dimmer so rows and tables stay crisp; elsewhere the pillar
 * reads at full strength. Keyed by the first path segment.
 */
const INTENSITY: Record<string, number> = {
  "": 0.28,
  explore: 0.2,
  insights: 0.2,
  c: 0.22,
  j: 0.22,
  workspace: 0.2,
  sources: 0.18,
};

/**
 * Feathering: the pillar fades out towards every edge, so the layer never shows a box; the
 * vertical fade keeps the top (where the route's --screen glow sits) and the bottom soft.
 */
const MASK =
  "radial-gradient(ellipse 55% 70% at 50% 30%, black 0%, rgba(0,0,0,0.55) 40%, transparent 80%)";

/**
 * React Bits LightPillar as a fixed, full-viewport light behind every app page (not /login,
 * which has its own scene). Mounted once in AppShell, so navigation never re-initialises it; the
 * route only changes the intensity uniform. The canvas is opaque, so the layer is blended into
 * the page: `screen` in dark (black disappears), and in light the component's light mode
 * (white background) with `multiply` (white disappears). Content scrolls over it.
 */
export function PillarBackground() {
  const pathname = usePathname();
  const started = useDeferredStart();
  // Probe WebGL only once the deferred start fires (the probe itself is a long task on slow GPUs).
  const mode = useWebGLMode(started);
  const { resolvedTheme } = useTheme();
  // On phones the pillar spans the whole content column, so it runs dimmer.
  const narrow = useMediaQuery("(max-width: 767px)", false);
  if (pathname === "/login" || mode !== "webgl" || !started) return null;
  const light = resolvedTheme === "light";
  const intensity = (INTENSITY[pathname.split("/")[1] ?? ""] ?? 0.22) * (narrow ? 0.4 : 1);
  return (
    <div
      aria-hidden
      data-pillar
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        mixBlendMode: light ? "multiply" : "screen",
        maskImage: MASK,
        WebkitMaskImage: MASK,
        opacity: light ? 0.55 : 1,
      }}
    >
      <LightPillar
        topColor="#5227FF"
        bottomColor="#FF9FFC"
        intensity={intensity}
        rotationSpeed={0.3}
        glowAmount={0.005}
        pillarWidth={3.0}
        pillarHeight={0.4}
        noiseIntensity={0.5}
        pillarRotation={0}
        interactive={false}
        mixBlendMode="normal"
        quality="medium"
        lightMode={light}
      />
    </div>
  );
}
