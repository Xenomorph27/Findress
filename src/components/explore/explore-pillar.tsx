"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useDeferredStart } from "@/lib/hooks/use-deferred-start";
import { useWebGLMode } from "@/lib/hooks/use-webgl";

// three.js + WebGL: browser only, fetched after the page is interactive.
const LightPillar = dynamic(() => import("@/components/react-bits/LightPillar"), { ssr: false });

/** The React Bits demo's background behind the pillar. */
export const DEMO_BG = "#120F17";

/**
 * React Bits LightPillar behind /explore only, configured like the official demo
 * (reactbits.dev/backgrounds/light-pillar): same props, `screen` blend over the demo's dark
 * purple, no masks, no dimming, no overlays. Fixed and full-viewport, so the list scrolls over a
 * still light. Rendered inside the /explore page, so it unmounts when you leave.
 * Dark theme only: the demo is a dark scene, and light-theme text is dark.
 */
export function ExplorePillar() {
  const { resolvedTheme } = useTheme();
  const started = useDeferredStart();
  const mode = useWebGLMode(started);
  if (resolvedTheme !== "dark") return null;
  return (
    <div
      aria-hidden
      data-pillar
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ backgroundColor: DEMO_BG }}
    >
      {mode === "webgl" && (
        <LightPillar
          topColor="#5227FF"
          bottomColor="#FF9FFC"
          intensity={1.0}
          rotationSpeed={0.3}
          glowAmount={0.002}
          pillarWidth={3.0}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={25}
          interactive={false}
          mixBlendMode="screen"
          quality="high"
        />
      )}
    </div>
  );
}
