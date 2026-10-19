"use client";

import { useOnline } from "@/lib/offline";

/** On the 404 page: with no signal, "doesn't exist" may only mean "didn't load". */
export function NotFoundOfflineNote() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="status" className="max-w-sm text-sm text-muted">
      No signal right now, so this may only have failed to load. Try again when you&apos;re back online.
    </p>
  );
}
