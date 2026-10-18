import type { Metadata } from "next";
import { MeClient } from "./me-client";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your points, badges, MRT toilet passport and submissions.",
};

export default function MePage() {
  return <MeClient />;
}
