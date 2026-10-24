/*
 * What /creator says about Dylan, kept out of the JSX so a line can change without touching the page.
 * This is the short card only: the full profile and CV live on his personal site. Never name an
 * employer here, and no GitHub link (the app links to none), phone number or school email.
 */

export const NAME = "Dylan Chua";

/** The one line under the name. */
export const INTRO = "I'm a software engineer in Singapore.";

/**
 * Dylan's personal site, where the full profile and CV live. This is the Vercel URL for now; it
 * changes when Dylan buys a domain.
 */
export const PERSONAL_SITE_URL = "https://personal-website-five-iota-61.vercel.app";

export const LINKEDIN_URL = "https://www.linkedin.com/in/dylan-chua-heok-kang-a2955a152";

/** Prefilled on the page's Email link. */
export const EMAIL_SUBJECT = "Hi Dylan, from your Shit Go Where page";

/**
 * Why and how he built the app, in first person. The page adds the bot's handle after `bot` (from
 * lib/site.ts, so it hides with the bot) and live numbers from the public API when it can be reached;
 * never type a count in here.
 */
export const SHIT_GO_WHERE = {
  why: "I built Shit Go Where on my own, on free tiers, because every Singaporean has asked the question in a hurry. It finds the nearest clean toilet, and I need to go walks you to the closest good one.",
  honest: "Check-ins keep the map honest, and every toilet carries a trust tier, so open data never passes for a toilet somebody visited.",
  honestLink: "How tiers work",
  bot: "On Telegram, send your location to",
  botAfter: "for the three nearest.",
};

/** Live counts from the public API, as a sentence with its figures marked for emphasis. */
export function liveNumbersLine(n: { toilets: number; verified: number; areas: number }): {
  text: string;
  figure?: boolean;
}[] {
  const f = (x: number) => x.toLocaleString("en-SG");
  return [
    { text: "Right now the map holds " },
    { text: `${f(n.toilets)} toilets`, figure: true },
    { text: " across " },
    { text: `${f(n.areas)} planning areas`, figure: true },
    { text: ", " },
    { text: `${f(n.verified)} of them surveyed in person`, figure: true },
    { text: "." },
  ];
}
