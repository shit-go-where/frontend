/**
 * The parts of @sentry/nextjs the browser uses, loaded lazily by lib/sentry-client.ts. Importing
 * named exports here (not `import("@sentry/nextjs")` there) lets the bundler drop replay, feedback
 * and the rest of the SDK from the chunk.
 */
export { captureException, init } from "@sentry/nextjs";
