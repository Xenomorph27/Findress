import type { Metadata } from "next";
import { Suspense } from "react";
import { UnlockForm } from "@/components/workspace/unlock-form";
import { Container } from "@/components/shell/states";

export const metadata: Metadata = { title: "Unlock", robots: { index: false } };

export default function UnlockPage() {
  return (
    <Container className="flex min-h-[70dvh] items-center justify-center py-16">
      <Suspense>
        <UnlockForm />
      </Suspense>
    </Container>
  );
}
