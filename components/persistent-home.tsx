"use client";

import { usePathname } from "next/navigation";
import { memo, useState } from "react";
import { HomeClient } from "@/app/home-client";

/** Rendered once: route changes toggle the wrapper, never re-render the map page. */
const StableHome = memo(function StableHome() {
  return <HomeClient />;
});

/**
 * The map page lives in the layout so switching tabs never tears down the
 * WebGL map. It mounts on the first visit to "/", then is only hidden
 * (display: none) on other routes, keeping the map, list, scroll and selection
 * as they were. The route view transition (route-transition.tsx) animates it in and out.
 */
export function PersistentHome() {
  const onHome = usePathname() === "/";
  const [visited, setVisited] = useState(onHome);
  if (onHome && !visited) setVisited(true);
  if (!visited) return null;
  return (
    <div hidden={!onHome}>
      <StableHome />
    </div>
  );
}
