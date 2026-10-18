// Serves the built app for Playwright with Server Components cut off from any local backend,
// so pages fall back to their client queries, which page.route mocks. Only `next start` gets
// the dead origin: the build before it still reads the real API_ORIGIN.
import { spawn } from "node:child_process";

const port = process.argv[2] ?? "3100";
const child = spawn("pnpm", ["exec", "next", "start", "--port", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, API_ORIGIN: "http://127.0.0.1:9" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
