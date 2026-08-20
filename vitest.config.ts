import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests for this app's pure server-side logic.
 *
 * Deliberately narrow: only `src/lib/**` is collected. The routes and React
 * components here are thin, and the logic worth pinning down — order pricing
 * and catalog projection — is already factored out of them.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["src/lib/**/*.test.ts"],
    environment: "node",
  },
});
