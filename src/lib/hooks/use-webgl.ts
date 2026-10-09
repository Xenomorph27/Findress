"use client";

import { useSyncExternalStore } from "react";

/**
 * Gate for the WebGL scenes (crystal ball, login galaxy/ripple/laser, background light pillar):
 * - "pending": server render / first client render (render nothing heavy yet)
 * - "static": no hardware WebGL2, or the viewer prefers reduced motion → show the static fallback
 * - "webgl": mount the canvas
 */
export type WebGLMode = "pending" | "static" | "webgl";

/**
 * Software rasterisers (no GPU acceleration: SwiftShader, llvmpipe, Microsoft Basic Render) run
 * shaders on the CPU, so a full-screen raymarch or particle field would block the main thread
 * for seconds. Treat them like "no WebGL2" and show the still art instead.
 */
export const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let webgl2: boolean | null = null;
function hasWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    let renderer = "";
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(
        (info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) ||
          gl.getParameter(gl.RENDERER) ||
          "",
      );
    }
    webgl2 = !!gl && !SOFTWARE_RENDERER.test(renderer);
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

/**
 * `enabled: false` keeps the answer "pending" without probing: creating a WebGL context is itself
 * a long task on slow devices, so deferred scenes only ask once they are about to draw.
 */
export function useWebGLMode(enabled = true): WebGLMode {
  return useSyncExternalStore(subscribe, enabled ? snapshot : pendingSnapshot, () => "pending");
}
const pendingSnapshot = (): WebGLMode => "pending";

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
