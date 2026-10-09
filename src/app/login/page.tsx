import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen, LoginScreenSkeleton } from "@/components/auth/login-screen";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    // useSearchParams (?next=) is request data, so the form streams in; the shell is static.
    <Suspense fallback={<LoginScreenSkeleton />}>
      <LoginScreen />
    </Suspense>
  );
}
