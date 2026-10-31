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
     * Served as-is, not authored here: `scripts/copy-sql-wasm.mjs` copies
     * sql.js's own minified loader in beside the `.wasm` it fetches.
     */
    "public/**",
  ]),
]);

export default eslintConfig;
