"use client";

import { useSyncExternalStore } from "react";

/**
 * Gate for the WebGL scenes (crystal ball, login galaxy/ripple/laser, background light pillar):
 * - "pending": server render / first client render (render nothing heavy yet)
 * - "static": no WebGL2, or the viewer prefers reduced motion → show the static fallback
 * - "webgl": mount the canvas
 */
export type WebGLMode = "pending" | "static" | "webgl";

let webgl2: boolean | null = null;
function hasWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webgl2 = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function snapshot(): WebGLMode {
  if (!hasWebGL2()) return "static";
  return window.matchMedia(REDUCED).matches ? "static" : "webgl";
}

export function useWebGLMode(): WebGLMode {
  return useSyncExternalStore(subscribe, snapshot, () => "pending");
}

/** Reduced-motion preference alone (for scenes that stay interactive but stop moving). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * WebGL2 availability alone; null until `enabled` (probing creates a GL context, which is a long
 * task on slow devices, so callers probe only once they are about to draw).
 */
export function useHasWebGL2(enabled = true): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    () => (enabled ? hasWebGL2() : null),
    () => null,
  );
}
