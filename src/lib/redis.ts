import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

// Fallback initialization to support Next.js build-time static page collection
// without throwing exceptions when env variables are missing from the build agent shell.
export const redis = new Redis({
  url: url || "https://fallback-placeholder.upstash.io",
  token: token || "fallback-token",
});
