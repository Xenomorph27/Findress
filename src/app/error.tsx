"use client";

import { Container, EmptyState } from "@/components/shell/states";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container className="py-20">
      <EmptyState
        title="Something drifted"
        action={
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      >
        This view hit an unexpected error. Other pages keep working.
      </EmptyState>
    </Container>
  );
}
