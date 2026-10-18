"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mascot } from "@/components/mascot";
import { Button, Card, buttonClass, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import { ME_KEY, useMe } from "@/lib/auth";
import { safeRedirect } from "@/lib/format";

const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

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
  const authError = sp.get("error");
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
        <h1 className="text-3xl leading-tight">Sign in to contribute</h1>
        <p className="mt-3 text-muted">
          You never need an account to find a toilet, see its details or get directions. Sign in only to add toilets, write
          reviews, check in and earn points, so your contributions are credited to you.
        </p>
      </div>

      {authError ? (
        <p role="alert" className="w-full rounded-2xl bg-danger-soft px-4 py-3 font-bold text-danger">
          Sign-in didn&apos;t work. Please try again.
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
          <a
            href={`/api/auth/google?redirect=${encodeURIComponent(redirect)}`}
            className={buttonClass("secondary", "lg", "w-full border-2")}
          >
            <GoogleMark /> Continue with Google
          </a>

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
