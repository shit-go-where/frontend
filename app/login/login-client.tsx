"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, FlaskConical, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Mascot } from "@/components/mascot";
import { Button, Card, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import { ME_KEY, useMe } from "@/lib/auth";
import { safeRedirect } from "@/lib/format";

const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

/**
 * What went wrong, from the `error` code the API's Google callback redirects here with. `authError` is the
 * older name (it used to land on the original page), still read so old links explain themselves.
 */
const AUTH_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled. Nothing was shared.",
  email_unverified: "Your Google email isn't verified yet. Verify it with Google, then try again.",
  expired: "That took a little long, so sign-in timed out. Please try again.",
  google_failed: "Google didn't let us finish signing you in. Please try again.",
  no_code: "Google didn't let us finish signing you in. Please try again.",
};
const AUTH_ERROR_FALLBACK = "Sign-in didn't work. Please try again.";

type InAppPlatform = "android" | "ios" | "other";

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

const noSubscribe = () => () => {};

/** Null on the server and while hydrating; the browser can't change under the page, so nothing to subscribe to. */
function useInAppBrowser(): InAppPlatform | null {
  return useSyncExternalStore(noSubscribe, inAppPlatform, () => null);
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginClient() {
  const sp = useSearchParams();
  const redirect = safeRedirect(sp.get("redirect"), "/");
  const errorCode = sp.get("error") ?? sp.get("authError");
  const cancelled = errorCode === "access_denied";
  const inApp = useInAppBrowser();
  const googleHref = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  const { data: me } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const dev = useMutation({
    mutationFn: () => api.devLogin({ email: email.trim(), displayName: name.trim() || undefined }),
    onSuccess: (m) => {
      qc.setQueryData(ME_KEY, m);
      void qc.invalidateQueries();
      router.replace(m.needsHandle ? "/me" : redirect);
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 pb-10 pt-10 text-center">
      <Mascot mood="happy" className="size-16" />
      <div>
        <h1 className="text-3xl leading-tight">{signInTitle(redirect)}</h1>
        <p className="mt-3 text-muted">
          You never need an account to find a toilet, see its details or get directions. Sign in only to add toilets, write
          reviews, check in and earn points, so your contributions are credited to you.
        </p>
      </div>

      {/* Cancelling at Google is a choice, not a fault: it reads calm, not red. */}
      {errorCode && !me ? (
        <p
          role={cancelled ? "status" : "alert"}
          className={cx(
            "w-full rounded-2xl px-4 py-3 font-bold",
            cancelled ? "bg-surface-2 text-fg" : "bg-danger-soft text-danger",
          )}
        >
          {AUTH_ERRORS[errorCode] ?? AUTH_ERROR_FALLBACK}
        </p>
      ) : null}

      {me ? (
        <Card className="w-full">
          <p>
            You&apos;re signed in as <strong>{me.handle ? `@${me.handle}` : me.displayName}</strong>.
          </p>
          <Link href={redirect} className={buttonClass("primary", "lg", "mt-3 w-full")}>
            Continue
          </Link>
        </Card>
      ) : (
        <>
          {/* Full-page navigation: the API sets a first-party cookie through the /api rewrite. */}
          {inApp ? (
            <>
              <InAppBrowserNotice platform={inApp} />
              {/* Some embedded browsers do get through; never leave someone without the button. */}
              <a href={googleHref} className={buttonClass("ghost", "md", "w-full")}>
                <GoogleMark /> Try Google sign-in anyway
              </a>
            </>
          ) : (
            <a href={googleHref} className={buttonClass("secondary", "lg", "w-full border-2")}>
              <GoogleMark /> Continue with Google
            </a>
          )}

          {DEV_LOGIN ? (
            <Card className="w-full p-5 text-left">
              <h2 className="flex items-center gap-2 text-lg leading-snug">
                <FlaskConical className="size-5 shrink-0 text-primary" aria-hidden /> Sign in with email (development only)
              </h2>
              <p className="mt-1 text-sm text-muted">This form only exists on local builds. There&apos;s no password.</p>
              <form
                className="mt-4 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  dev.mutate();
                }}
              >
                <label htmlFor="dev-email" className="font-bold">
                  Email
                </label>
                <input
                  id="dev-email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label htmlFor="dev-name" className="mt-2 font-bold">
                  Display name (optional)
                </label>
                <input id="dev-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
                <Button type="submit" size="lg" className="mt-3" loading={dev.isPending} disabled={!email.includes("@")}>
                  Sign in with email
                </Button>
                {dev.isError ? (
                  <p role="alert" className="text-sm font-bold text-danger">
                    {errorMessage(dev.error)}
                  </p>
                ) : null}
              </form>
            </Card>
          ) : null}
        </>
      )}

      <p className="text-sm text-muted">
        From Google we only keep your email, name and profile picture, and we never show your email or name publicly. See
        the{" "}
        <Link href="/privacy" className="font-bold text-primary underline">
          privacy notice
        </Link>
        .
      </p>

      {!me ? (
        <Link href="/" className={buttonClass("ghost", "md", "w-full")}>
          <MapIcon className="size-5" aria-hidden /> Just browsing? Back to the map
        </Link>
      ) : null}
    </div>
  );
}

/**
 * In an app's embedded browser: say why Google won't work here and get the person into a real browser with
 * this same page (the redirect rides along in the URL).
 */
function InAppBrowserNotice({ platform }: { platform: InAppPlatform }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const href = typeof window === "undefined" ? "" : window.location.href;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopy("copied");
    } catch {
      // Some embedded browsers block the clipboard: show the link to copy by hand.
      setCopy("failed");
    }
  };
  // Hands the page to Chrome on Android; the scheme matches this page's (http on a local build).
  const chromeIntent =
    typeof window === "undefined"
      ? ""
      : `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=${window.location.protocol.replace(":", "")};package=com.android.chrome;end`;

  return (
    <Card className="w-full p-5 text-left">
      <h2 className="text-lg leading-snug">Open this page in your browser</h2>
      <p className="mt-2">Google doesn&apos;t allow sign-in inside this app&apos;s browser.</p>
      {platform === "ios" ? (
        <p className="mt-2">
          Tap the <strong>⋯</strong> or share menu, then choose <strong>Open in Safari</strong> or{" "}
          <strong>Open in browser</strong>. Or copy the link and paste it into Safari.
        </p>
      ) : (
        <p className="mt-2">
          {platform === "android" ? "Open it in Chrome, or copy" : "Copy"} the link and paste it into your browser, then sign
          in there.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {platform === "android" ? (
          <a href={chromeIntent} className={buttonClass("primary", "lg", "w-full")}>
            <ExternalLink className="size-5" aria-hidden /> Open in Chrome
          </a>
        ) : null}
        <Button variant={platform === "android" ? "secondary" : "primary"} size="lg" className="w-full" onClick={onCopy}>
          {copy === "copied" ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
          {copy === "copied" ? "Link copied" : "Copy link"}
        </Button>
        {/* Always in the page (empty until a tap) so screen readers announce the result. */}
        <p role="status" className="text-sm text-muted">
          {copy === "copied" ? "Link copied. Paste it into your browser's address bar." : null}
          {copy === "failed" ? "Couldn't copy here. Press and hold the link below to copy it." : null}
        </p>
        {copy === "failed" ? <p className="break-all rounded-2xl bg-surface-2 px-3 py-2 text-sm select-all">{href}</p> : null}
      </div>
      <p className="mt-4 text-sm text-muted">You can still find toilets and get directions here without signing in.</p>
    </Card>
  );
}

/** Says what the sign-in is for, so a tap on Add or Me doesn't land on a page that seems unrelated. */
function signInTitle(redirect: string): string {
  const path = redirect.split(/[?#]/)[0];
  if (path.startsWith("/add")) return "Sign in to add a toilet";
  if (path.startsWith("/review")) return "Sign in to review new toilets";
  if (path.startsWith("/me")) return "Sign in to see your points";
  if (path.startsWith("/admin")) return "Sign in to moderate";
  if (/^\/toilets\//.test(path)) return redirect.includes("do=checkin") ? "Sign in to check in" : "Sign in to contribute";
  return "Sign in to contribute";
}
