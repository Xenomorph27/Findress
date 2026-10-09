import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CommandPaletteProvider } from "@/components/command/command-palette-provider";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TimezoneProvider } from "@/components/timezone/timezone-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — AI/ML conference & workshop explorer`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Every AI/ML conference and workshop in one view: live deadlines, rankings, acceptance rates, CFP text and a grounded research assistant.",
  applicationName: SITE_NAME,
  openGraph: {
    title: SITE_NAME,
    description: SITE_TAGLINE,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090f" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <TimezoneProvider>
            <TooltipProvider delayDuration={250}>
              <CommandPaletteProvider>
                <a
                  href="#main"
                  className="bg-surface sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
                >
                  Skip to content
                </a>
                <div className="starfield" aria-hidden />
                <SiteHeader />
                <main id="main" className="flex-1">
                  {children}
                </main>
                <SiteFooter />
              </CommandPaletteProvider>
            </TooltipProvider>
          </TimezoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
