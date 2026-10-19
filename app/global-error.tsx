"use client";

import { Mascot } from "@/components/mascot";
import { buttonClass } from "@/components/styles";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-script";
// The layout's own faces and variables (one declaration, no second set of files), so the crash page speaks in the app's voice.
import { dela, rounded } from "./fonts";
import "./globals.css";

/** Replaces the root layout when it crashes, so it brings its own document, styles, font and theme. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-SG" className={`${dela.variable} ${rounded.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10 text-fg">
        <title>Something went wrong · Shit Go Where</title>
        <div role="alert" className="flex w-full max-w-md flex-col items-center gap-3 text-center">
          <Mascot mood="worried" className="size-28" />
          <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">Aiyo, the app crashed</h1>
          <p className="max-w-sm text-muted">Sorry about that. Try again, or head back to the map.</p>
          {/* Full page loads on purpose: the app shell is what crashed. */}
          <div className="mt-5 flex w-full flex-col gap-3">
            <a href="/go?urgent=1" className={buttonClass("urgent", "lg")}>
              I need to go now
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={buttonClass("secondary", "lg")}>
              Back to the map
            </a>
            <button type="button" onClick={() => retry()} className={buttonClass("ghost", "lg")}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
