import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { BottomNav, SiteHeader } from "@/components/nav";
import { PersistentHome } from "@/components/persistent-home";
import { RouteTransition } from "@/components/route-transition";
import { MOTION_BOOT_SCRIPT } from "@/lib/motion";
import { SITE_URL } from "@/lib/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-script";
import { dela, rounded } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Shit Go Where – find a toilet in Singapore, fast",
    template: "%s · Shit Go Where",
  },
  description:
    "Find, rate and walk to the nearest clean public toilet in Singapore. Bidets, accessible toilets, baby change, live status from people nearby.",
  applicationName: "Shit Go Where",
  appleWebApp: { capable: true, title: "ShitGoWhere", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the keyboard shrinks the layout, so docked bars and dialog sheets stay above it.
  // iOS ignores this; Dialog (components/ui.tsx) lifts itself with visualViewport instead.
  interactiveWidget: "resizes-content",
  // No themeColor: THEME_BOOT_SCRIPT adds the theme-color meta and keeps it on the chosen theme.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={`${dela.variable} ${rounded.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT + MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {/* Keeps the installed iPhone app's white status bar readable in both themes (globals.css). */}
        <div aria-hidden className="status-scrim" />
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(env(safe-area-inset-top)+1rem)]"
        >
          Skip to content
        </a>
        <Providers>
          <Suspense fallback={null}>
            <RouteTransition />
          </Suspense>
          <SiteHeader />
          {/* Before <main> in the DOM so "I need to go" is an early tab stop on phones (it is fixed to the bottom visually). */}
          <BottomNav />
          <main id="main" className="flex min-h-[calc(100dvh-4rem)] flex-col pb-[calc(var(--nav-h)+var(--nav-crown)+env(safe-area-inset-bottom)+1rem)] md:pb-0">
            {/* The map stays mounted across tabs (hidden off "/"), so leaving and returning are instant. */}
            <Suspense fallback={null}>
              <PersistentHome />
            </Suspense>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
