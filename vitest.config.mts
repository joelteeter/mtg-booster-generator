import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
 * Node environment only: everything under test here is pure. `lib/booster` has
 * no DOM and no network, which is what makes the old-vs-new parity harness in
 * tests/ a straight total-function comparison rather than a UI check.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
