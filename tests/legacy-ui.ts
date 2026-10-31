/*
 * The pure helpers from the old `js/ui.js`, loaded the same way as
 * `scryfall.js`: a VM context with the globals `state.js` would have defined.
 *
 * Only the value-in/value-out helpers are collected. The rest of that file
 * builds HTML and reads `document`, which is exactly the part the port
 * replaces with React and cannot be compared.
 *
 * Deleted with the old app in phase 6.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any */
const require_ = createRequire(import.meta.url);

export interface LegacyUi {
  pct(p: number | null): string;
  rarityClass(label: string): string;
  foilText(outcomes: any[]): string;
  foilWord(f: any): string;
  specialText(outcomes: any[]): string;
  collapseChanges(changes: any[]): any[];
  changeText(change: any): string;
  slotOptionNames(slot: any, opts: any): string[];
  vanillaOpts(opts: any): any;
  rarityMix(map: Map<string, any[]>): string;
  landShare(map: Map<string, any[]>): number;
  expectedLands(slots: any[], pools: any): number | null;
  POOL_NAMES: Record<string, string>;
  FUN_NAMES: Record<string, string>;
}

export function loadLegacyUi(): LegacyUi {
  const src = readFileSync(
    fileURLToPath(new URL("../js/ui.js", import.meta.url)),
    "utf8",
  );
  const sandbox: Record<string, unknown> = {
    L: require_("../js/booster-logic.js"),
    // Declared by state.js; none of the collected helpers reads them.
    $: () => null,
    mode: "play",
    setMeta: {},
    loadedPools: {},
    poolCache: {},
    setSelect: {},
    cmdSetSelect: {},
    document: { querySelectorAll: () => [], getElementById: () => null },
    window: {},
    console: { warn: () => {}, error: () => {}, log: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  const collect = `;({
    pct, rarityClass, foilText, foilWord, specialText,
    collapseChanges, changeText, slotOptionNames, vanillaOpts,
    rarityMix, landShare, expectedLands, POOL_NAMES, FUN_NAMES
  })`;
  return vm.runInNewContext(src + collect, sandbox, {
    filename: "js/ui.js",
  }) as LegacyUi;
}
