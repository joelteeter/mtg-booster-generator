/*
 * Puts sql.js where the app can fetch it.
 *
 * sql.js is an Emscripten build: it reaches for Node's `fs` when a bundler
 * looks at it, and it loads its own `.wasm` from beside itself at runtime. So
 * it is served as a plain script rather than bundled, exactly as the old app
 * loaded it — the difference being that these copies come from this site, so
 * the MTGProxyPrinter export, the one export that is not optional, depends on
 * no third-party CDN.
 *
 * Both files are build outputs, not source, so they are gitignored and copied
 * here on install and before every build.
 */
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILES = ["sql-wasm.js", "sql-wasm.wasm"];

const require_ = createRequire(import.meta.url);
for (const file of FILES) {
  let src;
  try {
    src = require_.resolve(`sql.js/dist/${file}`);
  } catch {
    // An install with --ignore-scripts can run this before sql.js is unpacked.
    console.warn("copy-sql-wasm: sql.js is not installed yet; skipping.");
    process.exit(0);
  }
  const dest = join(root, "public", file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copy-sql-wasm: ${statSync(dest).size} bytes → public/${file}`);
}
