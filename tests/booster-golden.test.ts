/*
 * The slot-spec sweep, against values recorded from the old app.
 *
 * Until phase 6 this ran `js/booster-logic.js` and `src/lib/booster/*.ts` over
 * the same inputs and diffed the results; it was the safety net the whole
 * migration rested on. The old implementation is gone, so the same matrix now
 * compares against what it produced on its last day, recorded in
 * `tests/golden/booster-*.txt`.
 *
 * The coverage is unchanged — every case that was compared is still compared —
 * but the meaning has shifted. It no longer asks "do the two agree?"; it asks
 * "has anything moved since the day they did?". When the odds are changed on
 * purpose, the right response is to read the diff and re-record by hand, which
 * is why the files say plainly that they cannot be regenerated.
 */
import { describe, expect, it } from "vitest";

import * as next from "@/lib/booster";
import type { PlayOptions, Stats } from "@/lib/booster/types";

import { LAYOUTS, OUTCOME_SETS, PLAY_CASES, POOL_REFS } from "./cases";
import { normSpec, specDifferences } from "./compare";
import {
  cardFixture,
  commanderFull,
  dsk,
  seededRng,
  statsCases,
  tokenFixture,
} from "./fixtures";
import { golden, readGolden } from "./goldens";
import {
  renderSequence,
  renderSheets,
  renderSpec,
  renderValue,
} from "./render";

/* eslint-disable @typescript-eslint/no-explicit-any */

const specs = readGolden("booster-specs");
const diffs = readGolden("booster-diffs");
const counts = readGolden("booster-counts");
const helpers = readGolden("booster-helpers");

const spec = (slots: any[]) => renderSpec(normSpec(slots));

describe("playSpec", () => {
  for (const [statsName, stats] of statsCases) {
    describe(statsName, () => {
      for (const c of PLAY_CASES) {
        it(c.name, () => {
          expect(spec(next.playSpec(c.opts, stats))).toBe(
            golden(specs, `play ${statsName} ${c.name}`),
          );
        });
      }
    });
  }
});

describe("commanderSpec", () => {
  for (const [statsName, stats] of statsCases) {
    describe(statsName, () => {
      for (const layout of LAYOUTS)
        for (const vanilla of [true, false])
          for (let mult = 1; mult <= 5; mult++) {
            const name = `${layout} ${vanilla ? "vanilla" : "fun"} x${mult}`;
            it(name, () => {
              expect(
                spec(next.commanderSpec(layout, { vanilla, mult }, stats)),
              ).toBe(golden(specs, `cmd ${statsName} ${name}`));
            });
          }
    });
  }
});

describe("godPackSpec", () => {
  for (const [statsName, stats] of statsCases) {
    it(statsName, () => {
      expect(spec(next.godPackSpec(stats))).toBe(
        golden(specs, `god ${statsName}`),
      );
    });
  }
});

describe("diffFromVanilla", () => {
  for (const [statsName, stats] of statsCases) {
    describe(statsName, () => {
      for (const c of PLAY_CASES) {
        it(`play ${c.name}`, () => {
          const vanillaOpts: PlayOptions = { ...c.opts, vanilla: true };
          expect(
            renderValue(
              next.diffFromVanilla(
                next.playSpec(c.opts, stats),
                next.playSpec(vanillaOpts, stats),
              ),
            ),
          ).toBe(golden(diffs, `play ${statsName} ${c.name}`));
        });
      }

      for (const layout of LAYOUTS)
        for (let mult = 1; mult <= 5; mult++) {
          it(`commander ${layout} fun x${mult}`, () => {
            expect(
              renderValue(
                next.diffFromVanilla(
                  next.commanderSpec(layout, { vanilla: false, mult }, stats),
                  next.commanderSpec(layout, { vanilla: true, mult }, stats),
                ),
              ),
            ).toBe(golden(diffs, `cmd ${statsName} ${layout} x${mult}`));
          });
        }

      it("null vanilla spec yields one empty change list per slot", () => {
        expect(
          renderValue(
            next.diffFromVanilla(
              next.playSpec({ vanilla: false, mult: 3 }, stats),
              null,
            ),
          ),
        ).toBe(golden(diffs, `null-vanilla ${statsName}`));
      });
    });
  }
});

describe("expectedCounts", () => {
  for (const [statsName, stats] of statsCases) {
    it(statsName, () => {
      for (const c of PLAY_CASES) {
        expect(
          renderValue(next.expectedCounts(next.playSpec(c.opts, stats))),
        ).toBe(golden(counts, `play ${statsName} ${c.name}`));
      }
      for (const layout of LAYOUTS)
        for (const vanilla of [true, false])
          for (let mult = 1; mult <= 5; mult++) {
            expect(
              renderValue(
                next.expectedCounts(
                  next.commanderSpec(layout, { vanilla, mult }, stats),
                ),
              ),
            ).toBe(
              golden(
                counts,
                `cmd ${statsName} ${layout} ${vanilla ? "vanilla" : "fun"} x${mult}`,
              ),
            );
          }
      expect(renderValue(next.expectedCounts(next.godPackSpec(stats)))).toBe(
        golden(counts, `god ${statsName}`),
      );
    });
  }
});

describe("probability helpers", () => {
  it("poolCount and usedPool", () => {
    for (const [statsName, stats] of statsCases)
      for (const ref of POOL_REFS) {
        const k = JSON.stringify(ref);
        expect(renderValue(next.poolCount(stats, ref))).toBe(
          golden(helpers, `poolCount ${statsName} ${k}`),
        );
        expect(renderValue(next.usedPool(stats, ref))).toBe(
          golden(helpers, `usedPool ${statsName} ${k}`),
        );
      }
  });

  it("finalize", () => {
    for (const [statsName, stats] of statsCases)
      for (const [i, outcomes] of OUTCOME_SETS.entries())
        expect(
          renderValue(next.finalize(structuredClone(outcomes) as any, stats)),
        ).toBe(golden(helpers, `finalize ${statsName} set ${i}`));
  });
});

describe("card helpers", () => {
  it("typeLine, the predicates and nameKey", () => {
    for (const [i, card] of cardFixture.entries())
      expect(
        renderValue({
          typeLine: next.typeLine(card),
          isLegendCreatureOrPW: next.isLegendCreatureOrPW(card),
          isBackground: next.isBackground(card),
          isPiper: next.isPiper(card),
          isBoosterFun: next.isBoosterFun(card),
          nameKey: next.nameKey(card),
        }),
      ).toBe(golden(helpers, `card ${i}`));
    expect(
      renderValue([next.isBoosterFun(null), next.isBoosterFun(undefined)]),
    ).toBe(golden(helpers, "isBoosterFun empty"));
  });

  it("groupByName and statsFromPools", () => {
    expect(renderValue(next.groupByName(cardFixture))).toBe(
      golden(helpers, "groupByName cards"),
    );
    expect(renderValue(next.groupByName([]))).toBe(
      golden(helpers, "groupByName empty"),
    );
    const pools = {
      commons: next.groupByName(cardFixture),
      rares: new Map(),
      meta: { boosterFiltered: true, ownSpg: 0, landSlotOnly: 2 },
    };
    expect(renderValue(next.statsFromPools(pools as any))).toBe(
      golden(helpers, "statsFromPools"),
    );
  });
});

describe("sampling", () => {
  const pools = {
    commons: next.groupByName(cardFixture),
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
      expect(renderValue(next.resolvePool(pools as any, ref))).toBe(
        golden(helpers, `resolvePool ${JSON.stringify(ref)}`),
      );
  });

  /*
   * A seeded generator draws the same sequence it drew for the old code. Any
   * change in how many values a function consumes, or what it does with them,
   * shows up as a different sequence from the same seed.
   */
  it("chooseOutcome and finishFor over 500 draws per slot", () => {
    const slots = next.playSpec({ vanilla: true, mult: 1, listEra: true }, dsk);
    slots.forEach((slot, si) => {
      const rng = seededRng(99);
      const picks: string[] = [];
      for (let i = 0; i < 500; i++) {
        const outcome = next.chooseOutcome(slot.outcomes, rng);
        picks.push(
          `${outcome ? outcome.label : "~"}/${next.finishFor(outcome, rng)}`,
        );
      }
      expect(renderSequence(picks)).toBe(golden(helpers, `sampling slot ${si}`));
    });
  });

  it("pickFromMap over 500 draws", () => {
    const nameMap = next.groupByName(cardFixture);
    const rng = seededRng(7);
    const picks: unknown[] = [];
    for (let i = 0; i < 500; i++) {
      const card = next.pickFromMap(nameMap, rng);
      picks.push(card ? card.id : null);
    }
    picks.push(next.pickFromMap(new Map(), rng) ?? null);
    expect(renderSequence(picks)).toBe(golden(helpers, "sampling pickFromMap"));
  });

  it("etched finishes are returned verbatim, not rolled", () => {
    const etched = {
      pool: "etched",
      label: "Foil-etched legend",
      p: 1,
      foil: "etched" as const,
    };
    expect(renderValue(next.finishFor(etched, seededRng(3)))).toBe(
      golden(helpers, "finishFor etched"),
    );
    expect(next.finishFor(etched, seededRng(3))).toBe("etched");
  });
});

describe("tokens", () => {
  it("tokenSetCode, isDoubleFacedToken, sortTokens and tokenPair", () => {
    for (const code of ["dsk", "DSK", "", null, undefined])
      expect(renderValue(next.tokenSetCode(code))).toBe(
        golden(helpers, `tokenSetCode ${JSON.stringify(code ?? null)}`),
      );
    for (const [i, t] of tokenFixture.entries())
      expect(renderValue(next.isDoubleFacedToken(t))).toBe(
        golden(helpers, `isDoubleFacedToken ${i}`),
      );
    expect(
      renderValue([
        next.isDoubleFacedToken(null),
        next.isDoubleFacedToken(undefined),
      ]),
    ).toBe(golden(helpers, "isDoubleFacedToken empty"));
    expect(renderValue(next.sortTokens(tokenFixture))).toBe(
      golden(helpers, "sortTokens"),
    );
    expect(renderValue(next.tokenPair(tokenFixture[0], tokenFixture[1]))).toBe(
      golden(helpers, "tokenPair"),
    );
  });

  it("tokenSheets at every page size, over many seeds", () => {
    for (const perPage of [1, 2, 4, 8, 9, 18]) {
      for (let seed = 1; seed <= 25; seed++)
        expect(
          renderSheets(next.tokenSheets(tokenFixture, perPage, seededRng(seed))),
        ).toBe(golden(helpers, `tokenSheets perPage=${perPage} seed=${seed}`));
      // A set with no token set degrades to no sheets rather than throwing.
      expect(renderSheets(next.tokenSheets([], perPage, seededRng(1)))).toBe(
        golden(helpers, `tokenSheets empty perPage=${perPage}`),
      );
    }
  });
});

describe("release dates, queries and constants", () => {
  it("todayISO", () => {
    for (const d of [
      new Date(2026, 9, 30),
      new Date(2024, 0, 1),
      new Date(2027, 11, 9),
    ])
      expect(renderValue(next.todayISO(d))).toBe(
        golden(
          helpers,
          `todayISO ${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        ),
      );
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
    for (const [i, set] of sets.entries())
      expect(renderValue(next.isReleased(set as any, "2026-10-30"))).toBe(
        golden(helpers, `isReleased ${i}`),
      );
  });

  it("landCycleQuery for every cycle that has names", () => {
    for (const cycle of next.LAND_CYCLES) {
      if (!cycle.names) continue;
      expect(renderValue(next.landCycleQuery(cycle))).toBe(
        golden(helpers, `landCycleQuery ${cycle.id}`),
      );
    }
  });

  it("constants", () => {
    expect(
      renderValue({
        PLAY_BOOSTER_START: next.PLAY_BOOSTER_START,
        LIST_ERA_END: next.LIST_ERA_END,
        GOD_PACK_CHANCE: next.GOD_PACK_CHANCE,
        LAYOUTS: next.LAYOUTS,
        COMMANDER_SETS: next.COMMANDER_SETS,
        LAND_CYCLES: next.LAND_CYCLES,
      }),
    ).toBe(golden(helpers, "constants"));
  });
});

/* A sanity check on the comparison itself: it must be able to see a change. */
describe("the comparison detects differences", () => {
  it("reports a changed probability, title and foil", () => {
    const slots = next.playSpec({ vanilla: true, mult: 1 }, dsk as Stats);
    const tampered = structuredClone(slots);
    tampered[0].title = "Not a common";
    tampered[3].outcomes[0].p = 0.123;
    tampered[6].outcomes[2].foil = 0;
    const found = specDifferences(slots, tampered);
    expect(found).toHaveLength(3);
    expect(found.join("\n")).toMatch(/title/);
    expect(spec(tampered)).not.toBe(spec(slots));
  });

  it("would notice a spec with the wrong number of slots", () => {
    const slots = next.commanderSpec(
      "cmr",
      { vanilla: true, mult: 1 },
      commanderFull,
    );
    expect(spec(slots.slice(1))).not.toBe(spec(slots));
  });
});
