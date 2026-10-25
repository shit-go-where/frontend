import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top contributors of all time and the cleanest toilets in each part of Singapore.",
  alternates: { canonical: "/leaderboard" },
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
