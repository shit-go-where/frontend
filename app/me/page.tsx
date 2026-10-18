import type { Metadata } from "next";
import { MobileTopBar } from "@/components/nav";
import { MeClient } from "./me-client";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your points, badges, MRT toilet passport and submissions.",
};

export default function MePage() {
  return (
    <>
      <MobileTopBar title="Me" />
      <MeClient />
    </>
  );
}
