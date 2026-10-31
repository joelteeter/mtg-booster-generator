/*
 * The case matrix the slot-spec sweep runs.
 *
 * It lives here rather than in the test because the golden files are keyed by
 * these names: the recorder that read them out of the old app and the test
 * that checks them have to agree on every key, and the old app is no longer
 * around to re-record from.
 */
import type { CommanderLayout, PlayOptions } from "@/lib/booster/types";

export const LAYOUTS: CommanderLayout[] = ["cmr", "clb", "cmm"];

export interface PlayCase {
  name: string;
  opts: PlayOptions;
}

/**
 * Play vanilla and fun at x1 through x5, each with `foilToggle` and
 * `listToggle` on and off, and `listEra` both ways. Vanilla ignores the
 * multiplier and both toggles, which is itself worth asserting.
 */
export function playCases(): PlayCase[] {
  const cases: PlayCase[] = [];
  for (const listEra of [false, true])
    for (const foilToggle of [false, true])
      for (const listToggle of [false, true])
        for (const vanilla of [true, false])
          for (let mult = 1; mult <= 5; mult++)
            cases.push({
              name:
                `${vanilla ? "vanilla" : "fun"} x${mult} ` +
                `listEra=${listEra} foil=${foilToggle} list=${listToggle}`,
              opts: { vanilla, mult, foilToggle, listToggle, listEra },
            });
  return cases;
}

export const PLAY_CASES = playCases();

/** Pool references the probability helpers are exercised with. */
export const POOL_REFS: Array<string | string[]> = [
  "commons",
  "mythics",
  "landDuals",
  "LIST",
  "nope",
  ["landBasics", "nonBasicLands", "commons"],
  ["legU", "legC", "legAll", "uncommons"],
  ["nope", "alsoNope"],
  [],
];

/** Outcome lists `finalize` is exercised with. */
export const OUTCOME_SETS = [
  [
    { pool: "commons", label: "Common", p: 0.5, foil: 0 },
    { pool: "landDuals", label: "Common dual land", p: 0.5, foil: 0.2 },
  ],
  [
    { pool: "nope", label: "Gone", p: 0.4, foil: 0 },
    { pool: "nope2", label: "Also gone", p: 0.6, foil: 0 },
  ],
  [
    { pool: "commons", label: "Common", p: 0, foil: 0 },
    { pool: "rares", label: "Rare", p: 1, foil: 1 },
  ],
  [{ pool: "commons", label: "Loading", p: null, foil: 0 }],
  [],
];
