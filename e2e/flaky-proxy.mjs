// A front for the app server (argv[3], default 3101) on argv[2] (default 3102) that can lose the
// signal per browser context, for the service worker tests. Playwright's context.setOffline() is
// unreliable once a worker controls the page (navigations can fail with ERR_INTERNET_DISCONNECTED
// before the worker sees them, and worker fetches may skip the emulation), and it also flips
// navigator.onLine, which underground phones often don't. A real dropped connection is what the
// worker has to survive, so the test sets a cookie and this proxy misbehaves:
//   sgw_stub_down=1       every request is dropped without a reply (tunnel: no signal at all)
//   sgw_stub_delay=<ms>   every request is held that long before it is forwarded (lie-fi)
import { createServer, request } from "node:http";

const port = Number(process.argv[2] ?? 3102);
const target = Number(process.argv[3] ?? 3101);

function cookie(req, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(req.headers.cookie ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

createServer(async (req, res) => {
  if (cookie(req, "sgw_stub_down")) return req.socket.destroy();
  const delay = Number(cookie(req, "sgw_stub_delay") ?? 0);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  if (req.destroyed) return;
  const up = request({ host: "127.0.0.1", port: target, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
  res.on("close", () => up.destroy());
  req.pipe(up);
}).listen(port, "127.0.0.1", () => console.log(`flaky proxy on http://127.0.0.1:${port} -> ${target}`));
