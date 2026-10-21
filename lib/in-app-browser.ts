"use client";

import { useSyncExternalStore } from "react";

export type InAppPlatform = "android" | "ios" | "other";

/**
 * Social and chat apps open links in their own embedded browser, where Google refuses to sign anyone in
 * ("disallowed_useragent"). Facebook, Instagram, LINE, TikTok, Telegram, WeChat, and any Android WebView.
 */
const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|\bLine\/|TikTok|musical_ly|BytedanceWebview|Telegram|MicroMessenger|; wv\)/;

function inAppPlatform(): InAppPlatform | null {
  const ua = navigator.userAgent;
  if (!IN_APP_UA.test(ua)) return null;
  if (/Android/.test(ua)) return "android";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  return "other";
}

/** Telegram's own browser says so in its user agent ("Telegram-Android/…"). Telegram on iOS mostly doesn't. */
const isTelegram = () => /Telegram/.test(navigator.userAgent);

const noSubscribe = () => () => {};

/** Null on the server and while hydrating; the browser can't change under the page, so nothing to subscribe to. */
export function useInAppBrowser(): InAppPlatform | null {
  return useSyncExternalStore(noSubscribe, inAppPlatform, () => null);
}

/** Opened from a Telegram chat. False on the server and while hydrating. */
export function useTelegramBrowser(): boolean {
  return useSyncExternalStore(noSubscribe, isTelegram, () => false);
}
