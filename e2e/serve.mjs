// Serves the built app for Playwright with Server Components cut off from any local backend,
// so pages fall back to their client queries, which page.route mocks. Only `next start` gets
// the dead origin: the build before it still reads the real API_ORIGIN.
import { spawn } from "node:child_process";

// `--live-api` keeps API_ORIGIN as built (the stub API, e2e/stub-api.mjs) so Server Components and
// the service worker get real answers; the default cuts them off so pages use the mocked client queries.
const port = process.argv[2] ?? "3100";
const live = process.argv.includes("--live-api");
const child = spawn("pnpm", ["exec", "next", "start", "--port", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, API_ORIGIN: live ? (process.env.API_ORIGIN ?? "http://localhost:4000") : "http://127.0.0.1:9" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
