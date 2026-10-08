import Link from "next/link";
import { Container, EmptyState } from "@/components/shell/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-20">
      <EmptyState
        title="Out of orbit"
        action={
          <Button asChild variant="outline">
            <Link href="/explore">Back to Explore</Link>
          </Button>
        }
      >
        We couldn’t find that venue. It may have been renamed, or a source stopped listing it.
      </EmptyState>
    </Container>
  );
}
