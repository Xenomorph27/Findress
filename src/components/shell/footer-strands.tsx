"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useWebGLMode } from "@/lib/hooks/use-webgl";

// WebGL, browser only, and only fetched once the footer is near the viewport.
const Strands = dynamic(() => import("@/components/react-bits/Strands"), { ssr: false });

const COLORS = ["#F97316", "#7C3AED", "#06B6D4"];
/** Fades the band into the page above it. */
const MASK = "linear-gradient(to bottom, transparent 0%, black 45%)";

/**
 * React Bits Strands as a soft band behind the site footer. Nothing runs (not even the WebGL2
 * probe) until the footer comes within 400px of the viewport; the component itself then pauses
 * off-screen, in hidden tabs and under reduced motion. Static gradient fallback without WebGL2.
 */
export function FooterStrands() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setNear(true);
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ maskImage: MASK, WebkitMaskImage: MASK }}
    >
      {near && <StrandsLayer />}
    </div>
  );
}

function StrandsLayer() {
  const mode = useWebGLMode();
  if (mode === "webgl") {
    return (
      <Strands
        colors={COLORS}
        count={3}
        speed={0.5}
        amplitude={1}
        waviness={1}
        thickness={0.7}
        glow={2.6}
        taper={3}
        spread={1}
        intensity={0.6}
        saturation={1.5}
        opacity={1}
        scale={1.5}
        glass={false}
        refraction={1}
        dispersion={1}
        glassSize={1}
      />
    );
  }
  if (mode === "static") {
    return (
      <div
        className="absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 opacity-40 blur-2xl"
        style={{
          background: `linear-gradient(90deg, transparent, ${COLORS.join(", ")}, transparent)`,
        }}
      />
    );
  }
  return null;
}
