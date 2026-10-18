/**
 * Server-side reads (Server Components only). These call API_ORIGIN directly
 * instead of going through the /api rewrite.
 */
import { cache } from "react";
import type { ToiletDetail } from "./types";

const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

export type ServerResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

async function serverGet<T>(path: string): Promise<ServerResult<T>> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      headers: { Accept: "application/json" },
      // Fail fast so a dead API turns into a friendly error state, not a hung page.
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 404) return { kind: "not-found" };
    if (!res.ok) return { kind: "error", message: `The API answered ${res.status}.` };
    return { kind: "ok", data: (await res.json()) as T };
  } catch {
    return { kind: "error", message: "The API is unreachable right now." };
  }
}

/** Deduped per request between generateMetadata and the page. */
export const getToiletServer = cache((id: string) =>
  serverGet<ToiletDetail>(`/toilets/${encodeURIComponent(id)}`),
);
