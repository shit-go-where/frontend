import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top contributors this week and the cleanest toilets in each part of Singapore.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
