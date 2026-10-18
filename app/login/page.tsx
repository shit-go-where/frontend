import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <h1 className="text-3xl font-extrabold">Sign in to contribute</h1>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
