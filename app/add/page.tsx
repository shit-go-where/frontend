import type { Metadata } from "next";
import { AddClient } from "./add-client";

export const metadata: Metadata = {
  title: "Add a toilet",
  description: "Add a missing public toilet to the map of Singapore.",
};

export default function AddPage() {
  return <AddClient />;
}
