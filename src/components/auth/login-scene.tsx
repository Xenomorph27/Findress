"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { useWebGLMode } from "@/lib/hooks/use-webgl";

// WebGL layers, browser only.
const Galaxy = dynamic(() => import("@/components/react-bits/Galaxy"), { ssr: false });
const RippleDistortion = dynamic(() => import("@/components/react-bits/RippleDistortion"), {
  ssr: false,
});
const LaserFlow = dynamic(() => import("@/components/react-bits/LaserFlow"), { ssr: false });

/** Galaxy rebuilds its WebGL context when these change identity: keep them module constants. */
const GALAXY_FOCAL: [number, number] = [0.5, 0.5];
const GALAXY_ROTATION: [number, number] = [1, 0];
export const BEAM_COLOR = "#FF79C6";

/** Feathers the globe ripple into the galaxy so the frame never shows. */
const VIGNETTE = "radial-gradient(ellipse 70% 65% at 50% 42%, black 35%, transparent 100%)";

// Phones and low-end devices get Galaxy + LaserFlow only (no ripple layer).
const LITE_QUERY = "(max-width: 767px)";
function subscribeLite(cb: () => void) {
  const mq = window.matchMedia(LITE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function liteSnapshot() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowEnd = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
  return lowEnd || window.matchMedia(LITE_QUERY).matches;
}

/**
 * The sign-in scene: one full-screen stack, card centred.
 *   1. Galaxy (back): stars that drift away from the pointer.
 *   2. The hero globe through RippleDistortion, full screen, screen-blended at ~0.6 over the
 *      galaxy with a soft vignette; it sits slightly above the card.
 *   3. LaserFlow: the beam pours down onto the card's top edge (the card is its `surfaceRef`, so
 *      the impact point follows the card at every width).
 *   4. The card (children).
 * One pointer listener on the wrapper forwards moves to Galaxy (it listens on its own element,
 * which sits under the other layers); the ripple and the beam listen on window already.
 */
export function LoginScene({
  heroSrc,
  cardRef,
  children,
}: {
  heroSrc: string;
  cardRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const mode = useWebGLMode();
  const lite = useSyncExternalStore(subscribeLite, liteSnapshot, () => true);
  const galaxyHost = useRef<HTMLDivElement>(null);

  const forward = useCallback((type: "mousemove" | "mouseleave", e?: ReactPointerEvent) => {
    const target = galaxyHost.current?.firstElementChild;
    if (!target) return;
    target.dispatchEvent(
      new MouseEvent(type, { clientX: e?.clientX ?? 0, clientY: e?.clientY ?? 0 }),
    );
  }, []);

  const webgl = mode === "webgl";
  return (
    <div
      className="dark relative isolate min-h-dvh overflow-hidden bg-[#05030a] text-[#e8ecf3]"
      onPointerMove={(e) => forward("mousemove", e)}
      onPointerLeave={() => forward("mouseleave")}
    >
      {/* 1 · Galaxy */}
      <div ref={galaxyHost} aria-hidden className="pointer-events-none fixed inset-0 -z-30">
        {webgl ? (
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

      {/* 2 · Globe ripple, full screen, blended into the galaxy */}
      {!lite && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-20 opacity-60 mix-blend-screen"
          style={{ maskImage: VIGNETTE, WebkitMaskImage: VIGNETTE }}
        >
          {/* Shifted up so the globe sits just above the card. */}
          <div className="absolute inset-x-0 -top-[14%] h-[115%]">
            <Image
              src={heroSrc}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover grayscale"
            />
            {webgl && (
              <div className="absolute inset-0">
                <RippleDistortion
                  src={heroSrc}
                  brushSize={150}
                  strength={0.2}
                  swirl={1}
                  rings={4}
                  grayscale
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3 · Laser beam onto the card */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 mix-blend-screen">
        {webgl ? (
          <LaserFlow surfaceRef={cardRef} beamPosition={0.5} color={BEAM_COLOR} />
        ) : (
          <StaticBeam />
        )}
      </div>

      {/* 4 · Card */}
      <div className="relative flex min-h-dvh items-center justify-center px-4 pt-[18vh] pb-12">
        {children}
      </div>
    </div>
  );
}

/** No WebGL2 / reduced motion: a still starfield. */
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

/** No WebGL2 / reduced motion: a still beam from the top down to the card's centre. */
function StaticBeam() {
  return (
    <div
      className="absolute top-0 left-1/2 h-[calc(50%+2rem)] w-[3px] -translate-x-1/2"
      style={{
        background: `linear-gradient(to bottom, transparent, ${BEAM_COLOR}aa 60%, ${BEAM_COLOR})`,
        boxShadow: `0 0 24px 6px ${BEAM_COLOR}55`,
      }}
    />
  );
}
