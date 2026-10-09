"use client";

import { Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { useCommandPalette } from "@/components/command/command-palette-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

export const NAV_ITEMS = [
  { href: "/explore", label: "Explore" },
  { href: "/insights", label: "Insights" },
  { href: "/workspace", label: "Workspace" },
  { href: "/sources", label: "Sources" },
] as const;

function isActive(pathname: string | null, href: string) {
  return pathname != null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** Links with the active marker. Reading the pathname is request data, so it streams in. */
function DesktopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && (
              <span aria-hidden className="bg-aurora absolute inset-x-3 -bottom-[11px] h-px" />
            )}
          </Link>
        );
      })}
    </>
  );
}

function ActiveDesktopNav() {
  return <DesktopNavLinks pathname={usePathname()} />;
}

function MobileNavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate: () => void;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-2.5 text-base",
            isActive(pathname, item.href)
              ? "bg-surface-2 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

function ActiveMobileNav({ onNavigate }: { onNavigate: () => void }) {
  return <MobileNavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

export function SiteHeader() {
  const { setOpen } = useCommandPalette();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-hairline bg-background/70 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-4 md:px-8">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Suspense fallback={<DesktopNavLinks pathname={null} />}>
            <ActiveDesktopNav />
          </Suspense>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-hairline bg-surface/60 text-muted-foreground hover:border-hairline-strong hover:text-foreground hidden h-8 items-center gap-2 rounded-lg border pr-1.5 pl-2.5 text-sm transition-colors sm:flex"
          >
            <Search className="size-3.5" aria-hidden />
            <span className="pr-6">Search venues…</span>
            <kbd className="border-hairline bg-surface-2 rounded border px-1.5 font-mono text-xs tracking-wide">
              Ctrl K
            </kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground sm:hidden"
            aria-label="Search venues"
            onClick={() => setOpen(true)}
          >
            <Search className="size-4" />
          </Button>
          <ThemeToggle />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="glass border-hairline w-72">
              <SheetHeader>
                <SheetTitle className="font-heading text-xl">FIndress</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                <Suspense
                  fallback={
                    <MobileNavLinks pathname={null} onNavigate={() => setMenuOpen(false)} />
                  }
                >
                  <ActiveMobileNav onNavigate={() => setMenuOpen(false)} />
                </Suspense>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
