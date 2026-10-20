import type { Metadata } from "next";
import { Suspense } from "react";
import { GoClient } from "./go-client";

export const metadata: Metadata = {
  title: "I need to go",
  description: "The 3 best toilets near you right now, with walking time and directions.",
  alternates: { canonical: "/go" },
};

function GoFallback() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4" aria-busy>
      <h1 className="text-3xl font-extrabold tracking-tight">Finding you a toilet…</h1>
    </div>
  );
}

export default function GoPage() {
  return (
    <Suspense fallback={<GoFallback />}>
      <GoClient />
    </Suspense>
  );
}
