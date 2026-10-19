import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shit Go Where",
    short_name: "ShitGoWhere",
    description: "Find, rate and walk to the nearest clean toilet in Singapore.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // No orientation lock (WCAG 1.3.4): a phone on a mount or a tablet in landscape gets the desktop layout.
    background_color: "#1e120b",
    theme_color: "#1e120b",
    categories: ["navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "I need to go", short_name: "Go now", url: "/go?urgent=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add a toilet", url: "/add" },
    ],
  };
}
