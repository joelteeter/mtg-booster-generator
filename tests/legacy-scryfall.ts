/*
 * The old `js/scryfall.js`, loaded as-is.
 *
 * Unlike `booster-logic.js` this file has no CommonJS export: it is a plain
 * browser script that declares top-level `const`s and reads globals that
 * `state.js` defines (`L`, `setMeta`, `poolCache`) plus `document` and `fetch`.
 * So it is run in a VM context with those globals supplied, and an appended
 * expression collects the declarations — they are in the script's lexical
 * scope, so code appended to the same script can see them.
 *
 * That gives genuine old-vs-new parity on the pool splitting, which is the part
 * with the subtle behaviour (the `is:booster` fallbacks, pulling common duals
 * out of the common sheet, matching Special Guests by release date).
 *
 * Deleted with the old app in phase 6.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any */
const require_ = createRequire(import.meta.url);

export interface LegacyScryfall {
  loadPlayPools(code: string): Promise<any>;
  loadCommanderPools(code: string): Promise<any>;
  loadCycle(cycle: any): Promise<Map<string, any[]>>;
  loadTokens(code: string): Promise<any[]>;
  fetchPool(query: string): Promise<any[]>;
  fetchRandom(query: string): Promise<any>;
  getSpg(): Promise<any[]>;
  getSetMeta(code: string): Promise<any>;
  sfFetch(url: string): Promise<Response>;
  bonusPool: any[];
  setMeta: Record<string, any>;
  API: string;
  REQUEST_GAP_MS: number;
  MAX_RETRIES: number;
}

export interface LegacyOptions {
  fetch: typeof globalThis.fetch;
  /** Default fires immediately, so the 150 ms queue does not slow tests. */
  setTimeout?: (fn: () => void, ms?: number) => unknown;
  onNotice?: (message: string) => void;
}

/** A fresh instance with its own module-level state (queue, SPG memo, caches). */
export function loadLegacyScryfall(options: LegacyOptions): LegacyScryfall {
  const src = readFileSync(
    fileURLToPath(new URL("../js/scryfall.js", import.meta.url)),
    "utf8",
  );
  const notice = options.onNotice ?? (() => {});
  const sandbox: Record<string, unknown> = {
    // From js/state.js, which the browser loads first.
    L: require_("../js/booster-logic.js"),
    setMeta: {},
    poolCache: {},
    loadedPools: {},
    // `rateLimitNotice` writes to these two elements; route it to the callback.
    document: {
      getElementById: (id: string) => ({
        offsetParent: {},
        set textContent(v: string) {
          notice(`${id}: ${v}`);
        },
      }),
    },
    console: { warn: () => {}, error: () => {}, log: () => {} },
    fetch: options.fetch,
    setTimeout: options.setTimeout ?? ((fn: () => void) => fn()),
    clearTimeout: () => {},
  };
  const collect = `;({
    loadPlayPools, loadCommanderPools, loadCycle, loadTokens,
    fetchPool, fetchRandom, getSpg, getSetMeta, sfFetch,
    bonusPool, setMeta, API, REQUEST_GAP_MS, MAX_RETRIES
  })`;
  return vm.runInNewContext(src + collect, sandbox, {
    filename: "js/scryfall.js",
  }) as LegacyScryfall;
}
