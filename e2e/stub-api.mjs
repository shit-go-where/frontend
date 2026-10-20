// A tiny stand-in for the NestJS API on port 4000 (or argv[2]), for the Playwright projects whose
// requests page.route cannot intercept: the service worker's (offline project) and the server-
// rendered pages' (axe project). It answers from e2e/api-data.ts, the same fixtures the page-level
// mock uses.
//
// Per-request switches ride on cookies (the Next rewrite forwards them, and so does the service
// worker's fetch), so parallel projects and tests never share state (losing the signal is the
// flaky proxy's job, e2e/flaky-proxy.mjs):
//   sgw_session=user|admin    signs the request in (the stub has no real auth)
//   sgw_test=<id>             tags the request; GET /__calls?id=<id> lists what that test requested
import { createServer } from "node:http";
import { fixtureReply } from "./api-data.ts";

const port = Number(process.argv[2] ?? 4000);
/** Requested paths per sgw_test id, for assertions. */
const calls = new Map();

function cookie(req, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(req.headers.cookie ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

function who(req) {
  const w = cookie(req, "sgw_session");
  return w === "user" || w === "admin" ? w : "anon";
}

function send(res, status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? null);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const body = await readBody(req);

  if (url.pathname === "/__calls") return send(res, 200, calls.get(url.searchParams.get("id") ?? "") ?? []);

  const id = cookie(req, "sgw_test");
  if (id) calls.set(id, [...(calls.get(id) ?? []), `${req.method} ${url.pathname}${url.search}`]);

  const reply = fixtureReply(req.method ?? "GET", url.pathname, url, who(req), body);
  if (!reply) return send(res, 404, { statusCode: 404, message: `Not mocked: ${req.method} ${url.pathname}` });
  send(res, reply.status ?? 200, reply.body ?? null);
}).listen(port, "127.0.0.1", () => console.log(`stub API on http://127.0.0.1:${port}`));
