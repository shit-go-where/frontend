import type { Metadata } from "next";
import { ReviewClient } from "./review-client";

export const metadata: Metadata = {
  title: "Review queue",
  description: "Approve or reject toilets and edits submitted near you.",
};

export default function ReviewPage() {
  return <ReviewClient />;
}
