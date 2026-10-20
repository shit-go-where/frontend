import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { ReviewClient } from "./review-client";

export const metadata: Metadata = {
  title: "Review queue",
  description: "Approve or reject toilets and edits submitted near you.",
  robots: { index: false },
};

export default function ReviewPage() {
  // ReviewClient reads `?id=` (a submission to show first), which needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<Spinner label="Loading submissions" />}>
      <ReviewClient />
    </Suspense>
  );
}
