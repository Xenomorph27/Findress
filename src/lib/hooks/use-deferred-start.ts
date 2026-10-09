"use client";

import { useEffect, useState } from "react";

const EVENTS = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * "Idle until urgent" for decorative WebGL: true on the visitor's first interaction, or `delayMs`
 * after the page has loaded, whichever comes first. Keeps shader compilation and particle setup
 * off the critical path, so the content is interactive before the visuals start.
 */
export function useDeferredStart(delayMs = 3000): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    let timer = 0;
    const go = () => setReady(true);
    const arm = () => {
      timer = window.setTimeout(go, delayMs);
    };
    for (const e of EVENTS) window.addEventListener(e, go, { once: true, passive: true });
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", arm);
      for (const e of EVENTS) window.removeEventListener(e, go);
    };
  }, [ready, delayMs]);
  return ready;
}
