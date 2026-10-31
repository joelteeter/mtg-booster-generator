/*
 * The old implementation, loaded as-is.
 *
 * `js/booster-logic.js` exports for CommonJS as well as the browser, so Node
 * can require it directly with no shim and no build step. That is the whole
 * reason the parity harness is cheap: both implementations are pure, so
 * comparing them is a total-function comparison rather than a UI check.
 *
 * This file is deleted along with the old app in phase 6, which is also when
 * the parity tests go.
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any;

/** Every function and constant the old module exported. Untyped on purpose. */
export interface LegacyApi {
  [key: string]: any;
  playSpec: AnyFn;
  commanderSpec: AnyFn;
  godPackSpec: AnyFn;
  diffFromVanilla: AnyFn;
  tokenSheets: AnyFn;
  expectedCounts: AnyFn;
}

export const legacy: LegacyApi = require_("../js/booster-logic.js");
