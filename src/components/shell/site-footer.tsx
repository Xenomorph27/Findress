import Link from "next/link";
import { REPO_URL } from "@/lib/site";
import { FooterStrands } from "./footer-strands";
import { OrbitMark } from "./wordmark";

/**
 * Site footer on the darkest chrome, with the Strands band behind it. The text sits on a chrome
 * scrim at the bottom of the band so it stays readable over the light trails.
 */
export function SiteFooter() {
  return (
    <footer className="bg-chrome relative isolate mt-24 flex min-h-[180px] flex-col justify-end overflow-hidden md:min-h-[260px]">
      <FooterStrands />
      <div className="from-chrome via-chrome/80 relative bg-gradient-to-t to-transparent">
        <div className="text-muted-foreground mx-auto flex max-w-[1280px] flex-col gap-4 px-4 pt-10 pb-8 text-sm md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2">
            <OrbitMark className="size-4" />
            <span>
              <span className="font-heading text-foreground text-base">FIndress</span> — every AI/ML
              venue, one view.
            </span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/sources" className="hover:text-foreground">
              Data sources
            </Link>
            <Link href="/insights" className="hover:text-foreground">
              Insights
            </Link>
            <a href={`${REPO_URL}#api`} className="hover:text-foreground">
              API
            </a>
            <a href={REPO_URL} className="hover:text-foreground" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
