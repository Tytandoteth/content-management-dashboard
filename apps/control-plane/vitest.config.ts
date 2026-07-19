import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-logic unit tests only (moderation, scheduler selection, publish mapping).
    // DB-backed flows are covered by the live smoke scripts.
    include: ["src/**/*.test.ts"],
  },
});
