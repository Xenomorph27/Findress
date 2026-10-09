"use client";

import dynamic from "next/dynamic";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useRef } from "react";
import { useWebGLMode } from "@/lib/hooks/use-webgl";

// WebGL, browser only.
const Galaxy = dynamic(() => import("@/components/react-bits/Galaxy"), { ssr: false });

/** Galaxy rebuilds its WebGL context when these change identity: keep them module constants. */
const GALAXY_FOCAL: [number, number] = [0.5, 0.5];
const GALAXY_ROTATION: [number, number] = [1, 0];

/**
 * The sign-in scene: the React Bits Galaxy starfield, full screen, with the card centred over it.
 * One pointer listener on the wrapper forwards moves to Galaxy (it listens on its own element,
 * which sits under the card), so the stars drift away from the pointer while the card stays
 * clickable.
 */
export function LoginScene({ children }: { children: ReactNode }) {
  const mode = useWebGLMode();
  const galaxyHost = useRef<HTMLDivElement>(null);

  const forward = useCallback((type: "mousemove" | "mouseleave", e?: ReactPointerEvent) => {
    const target = galaxyHost.current?.firstElementChild;
    if (!target) return;
    target.dispatchEvent(
      new MouseEvent(type, { clientX: e?.clientX ?? 0, clientY: e?.clientY ?? 0 }),
    );
  }, []);

  return (
    <div
      className="dark relative isolate min-h-dvh overflow-hidden bg-[#05030a] text-[#e8ecf3]"
      onPointerMove={(e) => forward("mousemove", e)}
      onPointerLeave={() => forward("mouseleave")}
    >
      <div ref={galaxyHost} aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        {mode === "webgl" ? (
          <Galaxy
            focal={GALAXY_FOCAL}
            rotation={GALAXY_ROTATION}
            mouseRepulsion
            mouseInteraction
            density={1.5}
            glowIntensity={0.5}
            saturation={0.8}
            hueShift={240}
            transparent
          />
        ) : (
          <StaticStars />
        )}
      </div>

      <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
        {children}
      </div>
    </div>
  );
}

/** No hardware WebGL2 / reduced motion: a still starfield. */
function StaticStars() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(1px 1px at 20% 30%, #fff8, transparent 60%), radial-gradient(1px 1px at 70% 20%, #fff6, transparent 60%), radial-gradient(1.5px 1.5px at 40% 70%, #fff7, transparent 60%), radial-gradient(1px 1px at 85% 60%, #fff5, transparent 60%), radial-gradient(80% 60% at 50% 30%, #2a1446 0%, transparent 70%)",
        backgroundSize: "220px 220px, 300px 300px, 260px 260px, 340px 340px, 100% 100%",
      }}
    />
  );
}
