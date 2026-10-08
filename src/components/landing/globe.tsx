"use client";

import createGlobe from "cobe";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

interface Props {
  markers: { id: string; lat: number; lng: number }[];
  /** Marker to pulse (hovered "next deadline" card). */
  highlight: { lat: number; lng: number } | null;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Slowly rotating dotted globe (DESIGN signature #1); upcoming venues glow in the accent.
 * Reduced motion → a single static frame.
 */
export function Globe({ markers, highlight, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightRef = useRef(highlight);
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const baseRef = useRef<{ location: [number, number]; size: number }[]>([]);

  useEffect(() => {
    highlightRef.current = highlight;
    // Reduced motion: no animation loop, so apply the (static) highlight directly.
    if (reduceMotion && globeRef.current) {
      const extra = highlight
        ? [{ location: [highlight.lat, highlight.lng] as [number, number], size: 0.08 }]
        : [];
      globeRef.current.update({ markers: [...baseRef.current, ...extra] });
    }
  }, [highlight, reduceMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let width = canvas.offsetWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let phi = 4.4; // start over Europe/Asia, where most venues are
    let frame = 0;
    let pulse = 0;

    const baseMarkers = markers.map((m) => ({
      location: [m.lat, m.lng] as [number, number],
      size: 0.05,
    }));
    baseRef.current = baseMarkers;
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: width * dpr,
      height: width * dpr,
      phi,
      theta: 0.28,
      dark: dark ? 1 : 0,
      diffuse: dark ? 1.6 : 1.3,
      mapSamples: 18000,
      mapBrightness: dark ? 9 : 4,
      mapBaseBrightness: dark ? 0.03 : 0.02,
      baseColor: dark ? [0.26, 0.31, 0.4] : [0.72, 0.75, 0.78],
      markerColor: hexToRgb(dark ? "#2ee6c5" : "#0d9488"),
      glowColor: dark ? [0.1, 0.22, 0.26] : [0.86, 0.92, 0.91],
      markers: baseMarkers,
      opacity: dark ? 0.9 : 0.95,
    });
    globeRef.current = globe;

    const onResize = () => {
      width = canvas.offsetWidth;
      globe.update({ width: width * dpr, height: width * dpr });
    };
    window.addEventListener("resize", onResize);

    const draw = () => {
      const h = highlightRef.current;
      pulse += 0.08;
      const extra = h
        ? [{ location: [h.lat, h.lng] as [number, number], size: 0.07 + Math.sin(pulse) * 0.025 }]
        : [];
      if (!reduceMotion) phi += 0.0022;
      globe.update({ phi, markers: [...baseMarkers, ...extra] });
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };
    draw();
    canvas.style.opacity = "1";

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      globe.destroy();
      globeRef.current = null;
    };
  }, [markers, dark, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        opacity: 0,
        transition: "opacity 600ms ease-out",
      }}
    />
  );
}
