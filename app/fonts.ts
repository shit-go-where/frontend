import localFont from "next/font/local";

/*
 * Latin-only copies of the two Google faces, kept in the repo (SIL Open Font License).
 * next/font/google can't be trusted to preload only Latin for these families: Google serves
 * M PLUS Rounded 1c (and Dela Gothic One) as ~120 numbered kanji slices per weight, and the
 * slices listed after the "latin" block carry no subset comment, so next/font counted them as
 * Latin and preloaded 192 files (about 2.5 MB) on every page. Text outside Latin falls back to
 * the system stack in globals.css. Shared by app/layout.tsx and app/global-error.tsx.
 */

/** Display voice: one chunky weight for headlines and big numbers. */
export const dela = localFont({
  variable: "--font-dela",
  src: [{ path: "./fonts/dela-gothic-one-400-latin.woff2", weight: "400", style: "normal" }],
  display: "swap",
});

/** Workhorse: rounded sans for everything else. */
export const rounded = localFont({
  variable: "--font-rounded",
  src: [
    { path: "./fonts/m-plus-rounded-1c-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/m-plus-rounded-1c-700-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/m-plus-rounded-1c-800-latin.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
});
