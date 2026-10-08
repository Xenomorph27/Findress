import Link from "next/link";
import { Container } from "@/components/shell/states";
import { Button } from "@/components/ui/button";
import { SITE_TAGLINE } from "@/lib/site";

export default function HomePage() {
  return (
    <Container className="py-24">
      <h1 className="font-display max-w-3xl text-6xl leading-[0.95]">{SITE_TAGLINE}</h1>
      <p className="text-muted-foreground mt-5 max-w-xl">
        Every AI/ML conference and workshop, with live deadlines, rankings and a grounded assistant.
      </p>
      <Button asChild className="mt-8">
        <Link href="/explore">Explore venues</Link>
      </Button>
    </Container>
  );
}
