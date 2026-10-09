"use client";

import createGlobe from "cobe";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { TypeBadge } from "@/components/event/chips";
import { CountdownChip } from "@/components/event/countdown-chip";
import { nearestWithin, phiFacing, project, unproject } from "@/lib/landing/globe-math";
import { exploreHrefFor, type VenueCluster } from "@/lib/landing/venues";
import { useDeferredStart } from "@/lib/hooks/use-deferred-start";
import { useHasWebGL2, usePrefersReducedMotion } from "@/lib/hooks/use-webgl";
import { formatDateRange } from "@/lib/time/format";
import { cn } from "@/lib/utils";

// Decorative back layer: no geography, no callbacks. Loaded only in the browser.
const CrystalizedBall = dynamic(() => import("@/components/react-bits/CrystalizedBall"), {
  ssr: false,
});

interface Props {
  venues: VenueCluster[];
  /** Venue to pulse (hovered "next deadline" card). */
  highlight: { lat: number; lng: number } | null;
}

/** Ball size (fraction of the shorter side) and the globe's sphere inside it. */
const BALL_SIZE = 0.7;
const GLOBE_CANVAS = 0.75; // cobe's sphere is 0.8 of its canvas → ~0.6 of the box, inside the ball
const CLICK_RADIUS_DEG = 5;
const HOVER_RADIUS_PX = 12;
const KEYBOARD_VENUES = 30;
const AUTO_SPIN = 0.12; // rad/s

type Popover = { cluster: VenueCluster; x: number; y: number; viaKeyboard: boolean };

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Landing "crystal globe": React Bits CrystalizedBall (plasma) behind the cobe globe of venues.
 * The globe owns pointer input: drag to rotate, hover for a tooltip, click a venue for a popover
 * of what's on there. The ball listens on window, so its glow still follows the pointer.
 * Keyboard: arrows rotate, Tab walks the venue list, Enter opens the popover.
 */
export function Globe({ venues, highlight }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  // cobe wraps its canvas in a div of its own, so React only renders an empty host and the
  // canvas is created inside it imperatively (otherwise React loses track of the moved node).
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const reduceMotion = usePrefersReducedMotion();
  // Decorative WebGL starts on first interaction or 3 s after load (null until then).
  const started = useDeferredStart();
  const webgl2 = useHasWebGL2(started);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<VenueCluster | null>(null); // hovered or focused
  const [popover, setPopover] = useState<Popover | null>(null);

  // Rotation and interaction state lives in refs: the draw loop reads it every frame.
  const view = useRef({
    phi: 4.4,
    theta: 0.28,
    vPhi: 0,
    target: null as null | { phi: number; theta: number },
  });
  const drag = useRef<null | {
    x: number;
    y: number;
    phi: number;
    theta: number;
    moved: boolean;
    lastX: number;
    lastT: number;
  }>(null);
  const activeRef = useRef<VenueCluster | null>(null);
  const popoverOpen = useRef(false);
  const highlightRef = useRef(highlight);
  const dirty = useRef(true);
  /** Ask the draw loop for a frame (set by the globe effect). */
  const wakeRef = useRef<() => void>(() => {});

  const keyboardVenues = useMemo(() => venues.slice(0, KEYBOARD_VENUES), [venues]);
  const size = Math.round(Math.min(box.w, box.h) * GLOBE_CANVAS);

  // Measure the box (the globe must fit at every width; the ball scales with it).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Canvas-relative pixel position of a cluster for the current rotation. */
  const screenOf = useCallback(
    (c: { lat: number; lng: number }) => {
      const p = project([c.lat, c.lng], view.current.phi, view.current.theta);
      return { x: p.x * size, y: p.y * size, visible: p.visible };
    },
    [size],
  );

  // The globe itself + the draw loop.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !size || !webgl2) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "display:block;width:100%;height:100%;opacity:0;transition:opacity 600ms ease-out";
    host.appendChild(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const base = venues.map((v) => ({
      location: [v.lat, v.lng] as [number, number],
      size: 0.022 + Math.min(v.count, 6) * 0.004,
    }));
    const markerColor = rgb(dark ? "#b8f6ff" : "#0e7490");
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: view.current.phi,
      theta: view.current.theta,
      dark: dark ? 1 : 0,
      diffuse: dark ? 1.5 : 1.2,
      mapSamples: 16000,
      mapBrightness: dark ? 7 : 3,
      mapBaseBrightness: dark ? 0.04 : 0.02,
      baseColor: dark ? [0.3, 0.26, 0.4] : [0.93, 0.89, 0.95],
      markerColor,
      glowColor: dark ? [0.5, 0.18, 0.45] : [0.99, 0.86, 0.96],
      markers: base,
      opacity: dark ? 0.86 : 0.92,
      // cobe v2 lifts markers 0.05 off the sphere by default, pushing limb markers past the
      // edge. Pin them to the surface; back-face markers are hidden by cobe.
      markerElevation: 0,
    });
    canvas.style.opacity = "1";

    let raf = 0;
    let last = performance.now();
    let pulse = 0;
    let onScreen = true;

    const placeOverlay = () => {
      const c = activeRef.current;
      const tip = tipRef.current;
      const ring = ringRef.current;
      if (!tip || !ring) return;
      if (!c) {
        tip.style.opacity = "0";
        ring.style.opacity = "0";
        return;
      }
      const p = screenOf(c);
      const show = p.visible ? "1" : "0";
      tip.style.opacity = show;
      ring.style.opacity = show;
      tip.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, calc(-100% - 12px))`;
      ring.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const v = view.current;
      let moving = false;
      if (v.target) {
        const dPhi = wrapPi(v.target.phi - v.phi);
        const dTheta = v.target.theta - v.theta;
        v.phi += dPhi * Math.min(1, dt * 7);
        v.theta += dTheta * Math.min(1, dt * 7);
        if (Math.abs(dPhi) < 0.002 && Math.abs(dTheta) < 0.002) v.target = null;
        moving = true;
      } else if (!drag.current && Math.abs(v.vPhi) > 0.0005) {
        v.phi += v.vPhi * dt * 60;
        v.vPhi *= Math.pow(0.92, dt * 60);
        moving = true;
      } else if (!reduceMotion && !drag.current && !popoverOpen.current && !activeRef.current) {
        v.phi += AUTO_SPIN * dt;
        moving = true;
      }
      const h = highlightRef.current;
      if (h) pulse += dt * 5;
      if (moving || h || dirty.current) {
        const extra = h
          ? [
              {
                location: [h.lat, h.lng] as [number, number],
                size: 0.06 + Math.sin(pulse) * 0.02,
                color: rgb(dark ? "#ffffff" : "#be185d"),
              },
            ]
          : [];
        globe.update({ phi: v.phi, theta: v.theta, markers: [...base, ...extra] });
        placeOverlay();
        dirty.current = false;
      }
      if (onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!raf && onScreen && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    wakeRef.current = () => {
      dirty.current = true;
      wake();
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      wake();
    });
    io.observe(canvas);
    const onVis = () => wake();
    document.addEventListener("visibilitychange", onVis);
    wake();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wakeRef.current = () => {};
      globe.destroy();
      host.replaceChildren();
    };
  }, [venues, dark, size, reduceMotion, webgl2, screenOf]);

  // Hand the latest UI state to the draw loop and ask it for a frame.
  useEffect(() => {
    activeRef.current = active;
    popoverOpen.current = popover !== null;
    highlightRef.current = highlight;
    wakeRef.current();
  }, [highlight, active, popover]);

  /** Pointer position as canvas fractions. */
  const fractions = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, r };
  };

  const hitTestHover = (fx: number, fy: number): VenueCluster | null => {
    let best: VenueCluster | null = null;
    let bestD = HOVER_RADIUS_PX;
    for (const c of venues) {
      const p = screenOf(c);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - fx * size, p.y - fy * size);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  };

  const openPopover = (cluster: VenueCluster, viaKeyboard: boolean) => {
    const p = screenOf(cluster);
    const offX = (box.w - size) / 2;
    const offY = (box.h - size) / 2;
    setPopover({ cluster, x: offX + p.x, y: offY + p.y, viaKeyboard });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = view.current;
    v.target = null;
    v.vPhi = 0;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      phi: v.phi,
      theta: v.theta,
      moved: false,
      lastX: e.clientX,
      lastT: performance.now(),
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        setActive(null);
      }
      if (d.moved) {
        const k = Math.PI / Math.max(size, 1);
        const v = view.current;
        v.phi = d.phi + dx * k;
        v.theta = clamp(d.theta + dy * k, -0.8, 0.8);
        const now = performance.now();
        v.vPhi = ((e.clientX - d.lastX) * k * 16) / Math.max(1, now - d.lastT);
        d.lastX = e.clientX;
        d.lastT = now;
        wakeRef.current();
      }
      return;
    }
    const { fx, fy } = fractions(e);
    const hit = hitTestHover(fx, fy);
    if (hit?.id !== active?.id) setActive(hit);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A click: the lat/lng under the pointer for the current rotation → nearest venue (≤ 5°).
    const { fx, fy } = fractions(e);
    const at = unproject(fx, fy, view.current.phi, view.current.theta);
    if (!at) return;
    const hit = nearestWithin(venues, at, CLICK_RADIUS_DEG);
    if (hit) openPopover(hit, false);
    // Open ocean: nothing happens.
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const v = view.current;
    const step = {
      ArrowLeft: [-0.18, 0],
      ArrowRight: [0.18, 0],
      ArrowUp: [0, -0.12],
      ArrowDown: [0, 0.12],
    }[e.key] as [number, number] | undefined;
    if (!step) return;
    e.preventDefault();
    v.target = { phi: v.phi + step[0], theta: clamp(v.theta + step[1], -0.8, 0.8) };
    wakeRef.current();
  };

  const focusVenue = (c: VenueCluster) => {
    setActive(c);
    view.current.target = {
      phi: phiFacing(c.lng),
      theta: clamp((c.lat * Math.PI) / 180, -0.7, 0.7),
    };
    wakeRef.current();
  };

  // Popover: Escape and outside clicks close it; keyboard opens move focus inside.
  useEffect(() => {
    if (!popover) return;
    if (popover.viaKeyboard) popoverRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || hostRef.current?.contains(t)) return;
      setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [popover]);

  const label = (c: VenueCluster) =>
    [c.city, c.country].filter(Boolean).join(", ") || "Unknown location";
  const ballTheme = dark ? "dark" : "light";
  const offX = (box.w - size) / 2;
  const offY = (box.h - size) / 2;

  return (
    <div className="relative w-full">
      <div
        ref={boxRef}
        className="relative h-[360px] w-full sm:h-[460px] lg:h-[600px]"
        role="group"
        aria-label="Globe of upcoming AI/ML venues. Use the arrow keys to rotate, Tab to step through venues, Enter to list what is on there."
        aria-describedby={listId}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {/* Back layer: the crystal ball (decorative), or a still glow without WebGL2 / with reduced motion. */}
        {webgl2 && !reduceMotion ? (
          <div className="pointer-events-none absolute inset-0">
            <CrystalizedBall
              preset="plasma"
              color="#F25BD0"
              size={BALL_SIZE}
              crackle={0.85}
              fill={0.5}
              interactive
              hoverStrength={0.7}
              theme={ballTheme}
            />
          </div>
        ) : (
          <StaticBall size={Math.min(box.w, box.h) * BALL_SIZE} />
        )}

        {/* Front layer: the cobe globe. */}
        {webgl2 !== false && size > 0 && (
          <div
            ref={hostRef}
            aria-hidden
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onPointerLeave={() => !drag.current && setActive(null)}
            className={cn(
              "absolute touch-none select-none",
              active ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
            )}
            style={{ left: offX, top: offY, width: size, height: size }}
          />
        )}

        {/* Tooltip + focus ring, positioned by the draw loop. */}
        <div
          className="pointer-events-none absolute"
          style={{ left: offX, top: offY, width: size, height: size }}
          aria-hidden
        >
          <div
            ref={ringRef}
            className="border-foreground absolute top-0 left-0 size-5 rounded-full border-2 opacity-0 transition-opacity"
          />
          <div
            ref={tipRef}
            className="bg-popover lift absolute top-0 left-0 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 transition-opacity"
          >
            {active && (
              <>
                <span className="font-medium">{label(active)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · <span className="font-mono">{active.count}</span>{" "}
                  {active.count === 1 ? "event" : "events"}
                </span>
              </>
            )}
          </div>
        </div>

        {popover && (
          <VenuePopover
            ref={popoverRef}
            popover={popover}
            box={box}
            label={label(popover.cluster)}
            onClose={() => setPopover(null)}
          />
        )}

        {webgl2 === false && <StaticVenueList venues={venues} />}
      </div>

      {/* Screen readers and keyboard: every venue as a list (Tab walks it; focus rotates the globe). */}
      <div id={listId} className="sr-only">
        <h2>Browse by location</h2>
        <ul>
          {keyboardVenues.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onFocus={() => focusVenue(c)}
                onBlur={() => setActive(null)}
                onClick={() => openPopover(c, true)}
              >
                {label(c)}: {c.count} {c.count === 1 ? "event" : "events"}
              </button>
            </li>
          ))}
          <li>
            <Link href="/explore">All venues in Explore</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Still ball for no-WebGL2 / reduced motion: a soft glow in the ball's colour. */
function StaticBall({ size }: { size: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 50% 50%, transparent 58%, color-mix(in oklab, #F25BD0 32%, transparent) 70%, transparent 72%), radial-gradient(circle at 35% 30%, color-mix(in oklab, #F25BD0 18%, transparent), transparent 70%)",
        boxShadow: "0 0 80px color-mix(in oklab, #F25BD0 25%, transparent)",
      }}
    />
  );
}

/** Without WebGL2 there is no globe to click, so the top places are listed instead. */
function StaticVenueList({ venues }: { venues: VenueCluster[] }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1.5 p-4">
      {venues.slice(0, 12).map((c) => (
        <Link
          key={c.id}
          href={exploreHrefFor(c)}
          className="bg-surface lift tint-row-hover rounded-full px-2.5 py-1 text-xs"
        >
          {c.city ?? c.country} <span className="text-muted-foreground font-mono">{c.count}</span>
        </Link>
      ))}
    </div>
  );
}

function VenuePopover({
  ref,
  popover,
  box,
  label,
  onClose,
}: {
  ref: React.Ref<HTMLDivElement>;
  popover: Popover;
  box: { w: number; h: number };
  label: string;
  onClose: () => void;
}) {
  const { cluster } = popover;
  const W = Math.min(300, box.w - 16);
  const left = clamp(popover.x - W / 2, 8, box.w - W - 8);
  // Open below the marker when it sits in the upper half, above it otherwise.
  const below = popover.y < box.h / 2;
  const more = cluster.count - cluster.events.length;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Venues in ${label}`}
      className="bg-popover lift absolute z-10 rounded-xl p-3 text-sm"
      style={{
        left,
        width: W,
        ...(below ? { top: popover.y + 14 } : { bottom: box.h - popover.y + 14 }),
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-heading leading-snug">
          {label}
          <span className="text-muted-foreground font-mono text-xs"> · {cluster.count}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 flex size-7 items-center justify-center rounded-md"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="space-y-1">
        {cluster.events.map((ev) => (
          <li key={ev.slug}>
            <Link
              href={`/c/${ev.slug}`}
              className="tint-row-hover -mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
            >
              <span className="min-w-0">
                <span className="font-heading">
                  {ev.acronym} <span className="text-muted-foreground">{ev.year}</span>
                </span>
                {ev.type !== "conference" && <TypeBadge type={ev.type} className="ml-2" />}
                <span className="text-muted-foreground block font-mono text-xs">
                  {formatDateRange(ev.startDate, ev.endDate) ?? "Dates not announced"}
                </span>
              </span>
              <CountdownChip dueAt={ev.nextDeadlineAt} />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={exploreHrefFor(cluster)}
        className="text-aurora-ink mt-2 inline-block text-xs hover:underline"
      >
        See all{more > 0 ? ` ${cluster.count}` : ""} in {cluster.city ?? cluster.country} →
      </Link>
    </div>
  );
}
