/*
 * Old-vs-new parity.
 *
 * Runs `js/booster-logic.js` and `src/lib/booster/*.ts` over the same inputs
 * and diffs the results. Both are pure, so this is a total-function comparison
 * rather than a UI check, and it is a far stronger guarantee than clicking
 * through the app — which is how every change before this was verified.
 *
 * Phase 6 deletes the old app, and these tests with it. Until then they are
 * the safety net the whole migration rests on.
 */
import { describe, expect, it } from "vitest";

import * as next from "@/lib/booster";
import type { CommanderLayout, PlayOptions, Stats } from "@/lib/booster/types";

import { legacy } from "./legacy";
import { mapToEntries, differences, specDifferences } from "./compare";
import {
  cardFixture,
  commanderFull,
  dsk,
  seededRng,
  statsCases,
  tokenFixture,
} from "./fixtures";

/* -------------------------------------------------------------------------
 * The sweep
 * ---------------------------------------------------------------------- */

interface PlayCase {
  name: string;
  opts: PlayOptions;
}

/**
 * Play vanilla and fun at x1 through x5, each with `foilToggle` and
 * `listToggle` on and off, and `listEra` both ways. Vanilla ignores the
 * multiplier and both toggles, which is itself worth asserting parity on.
 */
function playCases(): PlayCase[] {
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

const LAYOUTS: CommanderLayout[] = ["cmr", "clb", "cmm"];

const PLAY_CASES = playCases();

describe("playSpec parity", () => {
  for (const [statsName, stats] of statsCases) {
    describe(statsName, () => {
      for (const c of PLAY_CASES) {
        it(c.name, () => {
          expect(
            specDifferences(
              legacy.playSpec(c.opts, stats),
              next.playSpec(c.opts, stats),
            ),
          ).toEqual([]);
        });
      }
    });
  }
});

describe("commanderSpec parity", () => {
  for (const [statsName, stats] of statsCases) {
    describe(statsName, () => {
      for (const layout of LAYOUTS)
        for (const vanilla of [true, false])
          for (let mult = 1; mult <= 5; mult++) {
            const opts = { vanilla, mult };
            it(`${layout} ${vanilla ? "vanilla" : "fun"} x${mult}`, () => {
              expect(
                specDifferences(
                  legacy.commanderSpec(layout, opts, stats),
                  next.commanderSpec(layout, opts, stats),
                ),
              ).toEqual([]);
            });
          }
    });
  }
});

describe("godPackSpec parity", () => {
  for (const [statsName, stats] of statsCases) {
    it(statsName, () => {
      expect(
        specDifferences(legacy.godPackSpec(stats), next.godPackSpec(stats)),
      ).toEqual([]);
    });
  }
});

describe("diffFromVanilla parity", () => {
  for (const [statsName, stats] of statsCases) {
    describe(statsName, () => {
      for (const c of PLAY_CASES) {
        it(`play ${c.name}`, () => {
          const vanillaOpts: PlayOptions = { ...c.opts, vanilla: true };
          const oldDiff = legacy.diffFromVanilla(
            legacy.playSpec(c.opts, stats),
            legacy.playSpec(vanillaOpts, stats),
          );
          const newDiff = next.diffFromVanilla(
            next.playSpec(c.opts, stats),
            next.playSpec(vanillaOpts, stats),
          );
          expect(differences(oldDiff, newDiff)).toEqual([]);
        });
      }

      for (const layout of LAYOUTS)
        for (let mult = 1; mult <= 5; mult++) {
          it(`commander ${layout} fun x${mult}`, () => {
            const oldDiff = legacy.diffFromVanilla(
              legacy.commanderSpec(layout, { vanilla: false, mult }, stats),
              legacy.commanderSpec(layout, { vanilla: true, mult }, stats),
            );
            const newDiff = next.diffFromVanilla(
              next.commanderSpec(layout, { vanilla: false, mult }, stats),
              next.commanderSpec(layout, { vanilla: true, mult }, stats),
            );
            expect(differences(oldDiff, newDiff)).toEqual([]);
          });
        }

      it("null vanilla spec yields one empty change list per slot", () => {
        const spec = next.playSpec({ vanilla: false, mult: 3 }, stats);
        expect(
          differences(
            legacy.diffFromVanilla(
              legacy.playSpec({ vanilla: false, mult: 3 }, stats),
              null,
            ),
            next.diffFromVanilla(spec, null),
          ),
        ).toEqual([]);
      });
    });
  }
});

describe("expectedCounts parity", () => {
  for (const [statsName, stats] of statsCases) {
    it(statsName, () => {
      for (const c of PLAY_CASES) {
        expect(
          differences(
            legacy.expectedCounts(legacy.playSpec(c.opts, stats)),
            next.expectedCounts(next.playSpec(c.opts, stats)),
            `play ${c.name}`,
          ),
        ).toEqual([]);
      }
      for (const layout of LAYOUTS)
        for (const vanilla of [true, false])
          for (let mult = 1; mult <= 5; mult++) {
            const opts = { vanilla, mult };
            expect(
              differences(
                legacy.expectedCounts(
                  legacy.commanderSpec(layout, opts, stats),
                ),
                next.expectedCounts(next.commanderSpec(layout, opts, stats)),
                `commander ${layout} ${vanilla} x${mult}`,
              ),
            ).toEqual([]);
          }
      expect(
        differences(
          legacy.expectedCounts(legacy.godPackSpec(stats)),
          next.expectedCounts(next.godPackSpec(stats)),
          "godPack",
        ),
      ).toEqual([]);
    });
  }
});

/* -------------------------------------------------------------------------
 * Helpers and constants
 * ---------------------------------------------------------------------- */

describe("probability helpers parity", () => {
  const poolRefs: Array<string | string[]> = [
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

  it("poolCount", () => {
    for (const [statsName, stats] of statsCases)
      for (const ref of poolRefs)
        expect(
          differences(
            legacy.poolCount(stats, ref),
            next.poolCount(stats, ref),
            `${statsName} ${JSON.stringify(ref)}`,
          ),
        ).toEqual([]);
  });

  it("usedPool", () => {
    for (const [statsName, stats] of statsCases)
      for (const ref of poolRefs)
        expect(
          differences(
            legacy.usedPool(stats, ref),
            next.usedPool(stats, ref),
            `${statsName} ${JSON.stringify(ref)}`,
          ),
        ).toEqual([]);
  });

  it("finalize", () => {
    const outcomeSets = [
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
    for (const [statsName, stats] of statsCases)
      for (const [i, outcomes] of outcomeSets.entries())
        expect(
          differences(
            legacy.finalize(structuredClone(outcomes), stats),
            next.finalize(structuredClone(outcomes), stats),
            `${statsName} set ${i}`,
          ),
        ).toEqual([]);
  });
});

describe("card helper parity", () => {
  it("typeLine, isLegendCreatureOrPW, isBackground, isPiper, isBoosterFun", () => {
    for (const card of cardFixture) {
      expect(legacy.typeLine(card)).toEqual(next.typeLine(card));
      expect(legacy.isLegendCreatureOrPW(card)).toEqual(
        next.isLegendCreatureOrPW(card),
      );
      expect(legacy.isBackground(card)).toEqual(next.isBackground(card));
      expect(legacy.isPiper(card)).toEqual(next.isPiper(card));
      expect(legacy.isBoosterFun(card)).toEqual(next.isBoosterFun(card));
    }
    for (const empty of [null, undefined])
      expect(legacy.isBoosterFun(empty)).toEqual(next.isBoosterFun(empty));
  });

  it("nameKey and groupByName", () => {
    for (const card of cardFixture)
      expect(legacy.nameKey(card)).toEqual(next.nameKey(card));
    expect(
      differences(
        mapToEntries(legacy.groupByName(cardFixture)),
        mapToEntries(next.groupByName(cardFixture)),
      ),
    ).toEqual([]);
    expect(
      differences(
        mapToEntries(legacy.groupByName([])),
        mapToEntries(next.groupByName([])),
      ),
    ).toEqual([]);
  });

  it("statsFromPools", () => {
    const pools = {
      commons: legacy.groupByName(cardFixture),
      rares: new Map(),
      meta: { boosterFiltered: true, ownSpg: 0, landSlotOnly: 2 },
    };
    expect(
      differences(legacy.statsFromPools(pools), next.statsFromPools(pools)),
    ).toEqual([]);
  });
});

describe("sampling parity", () => {
  const pools = {
    commons: legacy.groupByName(cardFixture),
    rares: new Map(),
    meta: { boosterFiltered: false, ownSpg: 0, landSlotOnly: 0 },
  };

  it("resolvePool", () => {
    for (const ref of [
      "commons",
      "rares",
      "nope",
      ["rares", "commons"],
      ["rares", "nope"],
    ] as Array<string | string[]>)
      expect(
        differences(
          mapToEntries(legacy.resolvePool(pools, ref)),
          mapToEntries(next.resolvePool(pools, ref)),
          JSON.stringify(ref),
        ),
      ).toEqual([]);
  });

  /*
   * The two implementations are handed separate generators seeded alike, so
   * they consume the same numbers in the same order. Any divergence in how
   * many values a function draws, or what it does with them, shows up here.
   */
  it("chooseOutcome, pickFromMap and finishFor over 500 draws", () => {
    const spec = next.playSpec({ vanilla: true, mult: 1, listEra: true }, dsk);
    for (const slot of spec) {
      const a = seededRng(99);
      const b = seededRng(99);
      for (let i = 0; i < 500; i++) {
        const oldOutcome = legacy.chooseOutcome(slot.outcomes, a);
        const newOutcome = next.chooseOutcome(slot.outcomes, b);
        expect(newOutcome).toBe(oldOutcome);
        expect(legacy.finishFor(oldOutcome, a)).toEqual(
          next.finishFor(newOutcome, b),
        );
      }
    }

    const nameMap = legacy.groupByName(cardFixture);
    const a = seededRng(7);
    const b = seededRng(7);
    for (let i = 0; i < 500; i++)
      expect(next.pickFromMap(nameMap, b)).toBe(
        legacy.pickFromMap(nameMap, a),
      );
    expect(next.pickFromMap(new Map(), b)).toEqual(
      legacy.pickFromMap(new Map(), a),
    );
  });

  it("etched finishes are returned verbatim, not rolled", () => {
    const etched = { pool: "etched", label: "Foil-etched legend", p: 1, foil: "etched" as const };
    const a = seededRng(3);
    const b = seededRng(3);
    expect(next.finishFor(etched, b)).toEqual(legacy.finishFor(etched, a));
    expect(next.finishFor(etched, b)).toBe("etched");
  });
});

describe("token parity", () => {
  it("tokenSetCode, isDoubleFacedToken, sortTokens, tokenPair", () => {
    for (const code of ["dsk", "DSK", "", null, undefined])
      expect(legacy.tokenSetCode(code)).toEqual(next.tokenSetCode(code));
    for (const t of tokenFixture)
      expect(legacy.isDoubleFacedToken(t)).toEqual(next.isDoubleFacedToken(t));
    for (const empty of [null, undefined])
      expect(legacy.isDoubleFacedToken(empty)).toEqual(
        next.isDoubleFacedToken(empty),
      );
    expect(
      differences(
        legacy.sortTokens(tokenFixture),
        next.sortTokens(tokenFixture),
      ),
    ).toEqual([]);
    expect(
      differences(
        legacy.tokenPair(tokenFixture[0], tokenFixture[1]),
        next.tokenPair(tokenFixture[0], tokenFixture[1]),
      ),
    ).toEqual([]);
  });

  it("tokenSheets at every page size, over many seeds", () => {
    for (const perPage of [1, 2, 4, 8, 9, 18]) {
      for (let seed = 1; seed <= 25; seed++) {
        expect(
          differences(
            legacy.tokenSheets(tokenFixture, perPage, seededRng(seed)),
            next.tokenSheets(tokenFixture, perPage, seededRng(seed)),
            `perPage=${perPage} seed=${seed}`,
          ),
        ).toEqual([]);
      }
      // A set with no token set degrades to no sheets rather than throwing.
      expect(
        differences(
          legacy.tokenSheets([], perPage, seededRng(1)),
          next.tokenSheets([], perPage, seededRng(1)),
          `empty perPage=${perPage}`,
        ),
      ).toEqual([]);
    }
  });
});

describe("release-date parity", () => {
  it("todayISO", () => {
    for (const d of [
      new Date(2026, 9, 30),
      new Date(2024, 0, 1),
      new Date(2027, 11, 9),
    ])
      expect(legacy.todayISO(d)).toEqual(next.todayISO(d));
    // Both read the same clock; compare them in the same tick.
    expect(legacy.todayISO()).toEqual(next.todayISO());
  });

  it("isReleased", () => {
    const sets = [
      { released_at: "2024-09-27" },
      { released_at: "2027-01-01" },
      { released: "2020-11-20" },
      { released_at: "2026-10-30" },
      {},
      null,
      undefined,
    ];
    for (const set of sets)
      for (const today of ["2026-10-30", undefined])
        expect(legacy.isReleased(set, today)).toEqual(
          next.isReleased(set, today),
        );
  });
});

describe("constant and query parity", () => {
  it("constants", () => {
    expect(next.PLAY_BOOSTER_START).toEqual(legacy.PLAY_BOOSTER_START);
    expect(next.LIST_ERA_END).toEqual(legacy.LIST_ERA_END);
    expect(next.GOD_PACK_CHANCE).toEqual(legacy.GOD_PACK_CHANCE);
    expect(differences(legacy.LAYOUTS, next.LAYOUTS)).toEqual([]);
    expect(
      differences(legacy.COMMANDER_SETS, next.COMMANDER_SETS),
    ).toEqual([]);
    expect(differences(legacy.LAND_CYCLES, next.LAND_CYCLES)).toEqual([]);
  });

  it("landCycleQuery for every cycle that has names", () => {
    for (const cycle of next.LAND_CYCLES) {
      if (!cycle.names) continue;
      expect(next.landCycleQuery(cycle)).toEqual(
        legacy.landCycleQuery(cycle),
      );
    }
  });
});

/*
 * The old module's whole public surface, so nothing is quietly left behind.
 * Phase 2 onward ports the impure files; this list is only about this one.
 */
describe("the port covers the old module's exports", () => {
  it("exports everything js/booster-logic.js did", () => {
    const missing = Object.keys(legacy).filter(
      (k) => !(k in (next as Record<string, unknown>)),
    );
    expect(missing).toEqual([]);
  });
});

/* A sanity check on the harness itself: it must be able to see a difference. */
describe("the harness detects differences", () => {
  it("reports a changed probability, title and foil", () => {
    const spec = next.playSpec({ vanilla: true, mult: 1 }, dsk as Stats);
    const tampered = structuredClone(spec);
    tampered[0].title = "Not a common";
    tampered[3].outcomes[0].p = 0.123;
    tampered[6].outcomes[2].foil = 0;
    const found = specDifferences(spec, tampered);
    expect(found).toHaveLength(3);
    expect(found.join("\n")).toMatch(/title/);
  });

  it("would notice a spec with the wrong number of slots", () => {
    const spec = next.commanderSpec("cmr", { vanilla: true, mult: 1 }, commanderFull);
    expect(specDifferences(spec, spec.slice(1))).not.toEqual([]);
  });
});
