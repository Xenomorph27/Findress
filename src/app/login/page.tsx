import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen, LoginScreenSkeleton } from "@/components/auth/login-screen";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * The ripple needs a local image (no WebGL CORS). public/hero.jpg is yours to add; until then a
 * generated placeholder is used. Checked at build time, so adding the file needs a rebuild.
 */
const HERO_SRC = existsSync(path.join(process.cwd(), "public", "hero.jpg"))
  ? "/hero.jpg"
  : "/hero-placeholder.jpg";

export default function LoginPage() {
  return (
    // useSearchParams (?next=) is request data, so the form streams in; the shell is static.
    <Suspense fallback={<LoginScreenSkeleton heroSrc={HERO_SRC} />}>
      <LoginScreen heroSrc={HERO_SRC} />
    </Suspense>
  );
}
