import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * The old app. `js/` is browser scripts sharing one global scope, which
     * this config cannot read: every function another file calls looks unused.
     * It is checked with `node --check` instead, and retired in phase 6 along
     * with build.py and dist/.
     */
    "js/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
