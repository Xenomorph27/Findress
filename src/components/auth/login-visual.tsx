"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useWebGLMode } from "@/lib/hooks/use-webgl";
import { cn } from "@/lib/utils";

// WebGL, browser only.
const RippleDistortion = dynamic(() => import("@/components/react-bits/RippleDistortion"), {
  ssr: false,
});

/**
 * The visual half of the sign-in screen: React Bits RippleDistortion over the local hero image
 * (local, so WebGL never hits CORS). The same image, still and greyscale, sits underneath as the
 * fallback for no-WebGL2, reduced motion and the first paint.
 */
export function LoginVisual({ src, className }: { src: string; className?: string }) {
  const mode = useWebGLMode();
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-[#05070c]", className)}>
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover opacity-90 grayscale"
      />
      {mode === "webgl" && (
        <div className="absolute inset-0">
          <RippleDistortion
            src={src}
            brushSize={150}
            strength={0.2}
            swirl={1}
            rings={4}
            grayscale
          />
        </div>
      )}
      {/* A breath of the login accent, so the panel belongs to the page. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 20% 10%, color-mix(in oklab, var(--screen) 16%, transparent), transparent 70%)",
        }}
      />
    </div>
  );
}
