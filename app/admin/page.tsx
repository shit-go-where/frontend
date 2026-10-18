import type { Metadata } from "next";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
