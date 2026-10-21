"use client";

import { Send, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTelegramBrowser } from "@/lib/in-app-browser";
import { telegramStartUrl } from "@/lib/site";
import { cx } from "./ui";

const DISMISS_KEY = "sgw:tg-strip-dismissed";
const listeners = new Set<() => void>();

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore: it just comes back next visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Opened from a Telegram chat (its in-app browser) and not dismissed. Server render and hydration read as
 * dismissed, so the strip only ever appears after hydration.
 */
export function useTelegramStrip(): boolean {
  const inTelegram = useTelegramBrowser();
  const gone = useSyncExternalStore(subscribe, dismissed, () => true);
  return inTelegram && !gone && !!telegramStartUrl("near");
}

/**
 * Someone who came from Telegram is one tap from the bot, which answers with a shared location faster than
 * this page can in Telegram's browser. One 44 px row, so the sheet's peek grows by no more than that.
 */
export function TelegramStrip({ className }: { className?: string }) {
  const show = useTelegramStrip();
  const href = telegramStartUrl("near");
  if (!show || !href) return null;
  return (
    <div className={cx("flex items-center rounded-2xl bg-primary-soft pl-3", className)}>
      {/* Same window: inside Telegram's browser a t.me link goes straight back to the chat. */}
      <a href={href} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm font-bold text-fg">
        <Send className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          Faster in the chat:{" "}
          <span className="text-primary underline underline-offset-2">send the bot your location</span>
        </span>
      </a>
      <button
        type="button"
        onClick={dismiss}
        className="tap flex shrink-0 items-center justify-center rounded-full text-muted hover:text-fg"
        aria-label="Dismiss the Telegram tip"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
