import { NextResponse, type NextRequest } from "next/server";

/**
 * Tells the API who the phone is. Vercel overwrites X-Forwarded-For on requests that arrive through
 * another proxy, and the /api rewrite is one, so without this the API would see a single Vercel IP for
 * every visitor and its per-IP limits would throttle all signed-out people together.
 *
 * With API_PROXY_SECRET set (server-only, never NEXT_PUBLIC_; the same value as on the API), /api/*
 * is rewritten here, to the same destination as the next.config.ts rewrite, with two request headers
 * the API trusts only alongside the secret:
 *   x-sgw-proxy-secret  the shared secret
 *   x-sgw-client-ip     x-real-ip, else the first X-Forwarded-For entry, as this edge received them
 * Without the secret this does nothing and the next.config.ts rewrite handles /api as before.
 * /ingest (analytics) is not matched.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  // Never omit it: a verified request without a client IP is treated by the API as a server render.
  return first || "unknown";
}

export function proxy(request: NextRequest) {
  const secret = process.env.API_PROXY_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const destination = new URL(`${API_ORIGIN}${pathname.replace(/^\/api(?=\/|$)/, "")}${search}`);

  const headers = new Headers(request.headers);
  // Whatever the browser sent under these names is replaced, never passed on.
  headers.set("x-sgw-proxy-secret", secret);
  headers.set("x-sgw-client-ip", clientIp(request));
  return NextResponse.rewrite(destination, { request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
