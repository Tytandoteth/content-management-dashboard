import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Pure-logic unit tests only (moderation, scheduler selection, publish mapping).
    // DB-backed flows are covered by the live smoke scripts.
    include: ["src/**/*.test.ts"],
  },
});
