/**
 * True when the browser asks not to be tracked: Do Not Track (any of its historical spellings) or
 * Global Privacy Control. Analytics (lib/analytics.ts) and error reporting (lib/sentry-client.ts)
 * both stay off when it is set. Browser only.
 */
export function doNotTrack(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.msDoNotTrack === "1" || w.doNotTrack === "1" || nav.globalPrivacyControl === true;
}
