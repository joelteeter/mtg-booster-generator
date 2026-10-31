/*
 * Parity for the pure parts of the slot panel.
 *
 * Phase 3 is the first phase with no end-to-end parity harness — the old UI is
 * DOM strings. But a good share of `js/ui.js` is value-in/value-out, and that
 * part is compared here against the original, loaded in a VM. What is left
 * untested by this file is markup.
 */
import { describe, expect, it } from "vitest";

import {
  commanderSpec,
  diffFromVanilla,
  groupByName,
  playSpec,
  statsFromPools,
} from "@/lib/booster";
import type { Outcome, Slot } from "@/lib/booster/types";
import {
  FUN_NAMES,
  POOL_NAMES,
  collapseChanges,
  describeChange,
  expectedChips,
  expectedLands,
  foilText,
  foilWord,
  landShare,
  lastSlotFoilChance,
  pct,
  poolNote,
  rarityClass,
  rarityMix,
  slotRange,
  slotsAffectedBy,
  slotOptionNames,
  taggedOutcomes,
  vanillaOpts,
} from "@/lib/explain";

import { dsk, lopsided, statsCases } from "./fixtures";
import { card } from "./fake-scryfall";
import { golden, readGolden } from "./goldens";
import { renderCalls, renderValue } from "./render";

const recorded = readGolden("explain");

/** Every spec the panel could be asked to render, across both tabs. */
function allSpecs(): Array<{ name: string; slots: Slot[] }> {
  const out: Array<{ name: string; slots: Slot[] }> = [];
  for (const [statsName, stats] of statsCases) {
    for (const vanilla of [true, false])
      for (let mult = 1; mult <= 5; mult++) {
        out.push({
          name: `play ${statsName} ${vanilla} x${mult}`,
          slots: playSpec(
            { vanilla, mult, listEra: true, listToggle: true, foilToggle: true },
            stats,
          ),
        });
        for (const layout of ["cmr", "clb", "cmm"] as const)
          out.push({
            name: `${layout} ${statsName} ${vanilla} x${mult}`,
            slots: commanderSpec(layout, { vanilla, mult }, stats),
          });
      }
  }
  return out;
}

const SPECS = allSpecs();

describe("pct", () => {
  it("matches the old formatting everywhere", () => {
    const values = [
      null, 0, 1, 0.5, 0.9995, 0.99949, 0.999, 0.0001, 0.00099, 0.001,
      1 / 64, 1 / 6, 5 / 6, 0.142857, 0.18, 0.67, 0.015, 1e-9, 0.12345,
    ];
    expect(renderCalls(values.map((v) => pct(v)))).toBe(
      golden(recorded, "pct"),
    );
  });

  it("never shows a non-zero chance as 0.0%", () => {
    expect(pct(0.0001)).toBe("<0.1%");
    expect(pct(0)).toBe("0.0%");
    expect(pct(0.9996)).toBe("100%");
  });
});

describe("rarityClass", () => {
  it("matches the old bucketing", () => {
    const labels = [
      "Common", "Uncommon", "Rare", "Mythic", "Basic land",
      "Common dual land", "Non-basic land", "Special Guest", "The List",
      "Legendary uncommon", "Legendary rare", "Legendary mythic",
      "Common/uncommon Background", "Rare Background", "The Prismatic Piper",
      "Foil-etched legend",
    ];
    expect(renderCalls(labels.map((l) => rarityClass(l)))).toBe(
      golden(recorded, "rarityClass"),
    );
  });
});

describe("foilText and foilWord", () => {
  it("matches the old text for every slot of every spec", () => {
    for (const { name, slots } of SPECS)
      expect(
        renderCalls(slots.map((s) => foilText(s.outcomes))),
        name,
      ).toBe(golden(recorded, `foilText ${name}`));
  });

  it("matches for the etched and all-foil edge cases", () => {
    const sets: Outcome[][] = [
      [{ pool: "a", label: "Foil-etched legend", p: 1, foil: "etched" }],
      [
        { pool: "a", label: "Foil-etched legend", p: 1 / 15, foil: "etched" },
        { pool: "b", label: "Common", p: 14 / 15, foil: 1 },
      ],
      [{ pool: "a", label: "Common", p: 1, foil: 1 }],
      [{ pool: "a", label: "Common", p: 1, foil: 0 }],
      [{ pool: "a", label: "Common", p: null, foil: 1 }],
      [{ pool: "a", label: "Common", p: null, foil: 0 }],
      [
        { pool: "a", label: "Common", p: null, foil: 0 },
        { pool: "b", label: "Rare", p: null, foil: 1 },
      ],
      [{ pool: "a", label: "Basic land", p: 1, foil: 0.2 }],
      [],
    ];
    expect(renderCalls(sets.map((s) => foilText(s)))).toBe(
      golden(recorded, "foilText edge cases"),
    );
  });

  it("matches foilWord for every finish", () => {
    expect(
      renderCalls([0, 1, 0.2, "etched", undefined].map((f) => foilWord(f as never))),
    ).toBe(golden(recorded, "foilWord"));
  });
});

describe("tagged outcomes", () => {
  it("picks out exactly the tags the old HTML showed", () => {
    for (const { name, slots } of SPECS) {
      const html = golden(recorded, `specialText ${name}`).split("\n");
      slots.forEach((slot, i) => {
        const tags = taggedOutcomes(slot.outcomes);
        const where = `${name} ${slot.title}`;
        if (!tags.length) {
          expect(html[i], where).toContain("—");
          return;
        }
        for (const t of tags) {
          expect(html[i], where).toContain(t.tag);
          if (t.p != null) expect(html[i]).toContain(pct(t.p));
        }
      });
    }
  });
});

describe("collapseChanges", () => {
  it("matches the old collapsing over every option combination", () => {
    for (const [statsName, stats] of statsCases)
      for (const vanilla of [true, false])
        for (let mult = 1; mult <= 5; mult++)
          for (const foilToggle of [false, true]) {
            const opts = { vanilla, mult, foilToggle, listToggle: true, listEra: true };
            const slots = playSpec(opts, stats);
            const diffs = diffFromVanilla(
              slots,
              playSpec(vanillaOpts(opts), stats),
            );
            const where = `${statsName} ${vanilla} x${mult} foil=${foilToggle}`;
            expect(
              renderCalls(diffs.map((changes) => collapseChanges(changes))),
              where,
            ).toBe(golden(recorded, `collapseChanges ${where}`));
          }
  });

  it("merges a shared foil shift into one entry and leaves others alone", () => {
    const merged = collapseChanges([
      { kind: "foil", label: "Rare", fromFoil: 0, toFoil: 1 },
      { kind: "foil", label: "Mythic", fromFoil: 0, toFoil: 1 },
      { kind: "foil", label: "Common", fromFoil: 0, toFoil: 0.2 },
      { kind: "p", label: "Rare", fromP: 0.1, toP: 0.2 },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[0].labels).toEqual(["Rare", "Mythic"]);
    expect(merged[1].labels).toEqual(["Common"]);
    expect(merged[2].kind).toBe("p");
  });
});

describe("describeChange", () => {
  /*
   * The old version returned HTML, so this compares the pieces rather than the
   * string: every value the component will render must appear in the old
   * markup for the same change.
   */
  it("carries the same values the old HTML did", () => {
    const changes = [
      { kind: "title" as const, fromTitle: "Common", toTitle: "Uncommon" },
      { kind: "added" as const, label: "The List", toP: 0.125 },
      { kind: "added" as const, label: "The List", toP: null },
      { kind: "removed" as const, label: "Common", fromP: 0.98 },
      { kind: "removed" as const, label: "Common", fromP: null },
      { kind: "p" as const, label: "Mythic", fromP: 0.14, toP: 0.42 },
      { kind: "p" as const, label: "Rare", fromP: 0.85, toP: 0.57 },
      { kind: "foil" as const, label: "Rare", fromFoil: 0 as const, toFoil: 1 as const },
    ];
    const html = golden(recorded, "changeText").split("\n");
    changes.forEach((c, i) => {
      const d = describeChange(c);
      for (const value of Object.values(d)) {
        if (typeof value !== "string" || !value || value === d.kind) continue;
        expect(html[i], `${c.kind}: ${value}`).toContain(value);
      }
    });
  });

  it("marks a rise and a fall the way the old arrows did", () => {
    expect(describeChange({ kind: "p", label: "M", fromP: 0.1, toP: 0.2 })).toMatchObject({
      direction: "up",
    });
    expect(describeChange({ kind: "p", label: "R", fromP: 0.2, toP: 0.1 })).toMatchObject({
      direction: "down",
    });
    // The old HTML used arrows for the same two changes.
    const html = golden(recorded, "changeText").split("\n");
    expect(html[5]).toContain("▲");
    expect(html[6]).toContain("▼");
  });

  it("collapses several rarities into one subject", () => {
    const d = describeChange({
      kind: "foil",
      label: "Rare",
      fromFoil: 0,
      toFoil: 1,
      labels: ["Common", "Uncommon", "Rare", "Mythic"],
    });
    expect(d).toMatchObject({ subject: "All 4 rarities", collapsed: true });
  });
});

describe("slotOptionNames and vanillaOpts", () => {
  it("matches the old attribution for every spec and option set", () => {
    for (const [statsName, stats] of statsCases)
      for (const vanilla of [true, false])
        for (let mult = 1; mult <= 5; mult++)
          for (const foilToggle of [false, true])
            for (const listToggle of [false, true]) {
              const opts = { vanilla, mult, foilToggle, listToggle, listEra: true };
              expect(
                renderCalls(
                  playSpec(opts, stats).map((slot) =>
                    slotOptionNames(slot, opts),
                  ),
                ),
              ).toBe(
                golden(
                  recorded,
                  `slotOptionNames ${statsName} ${vanilla} x${mult}` +
                    ` foil=${foilToggle} list=${listToggle}`,
                ),
              );
            }
  });

  it("switches off every fun option, matching the old object", () => {
    const opts = {
      vanilla: false,
      mult: 4,
      guest: true,
      foilToggle: true,
      listToggle: true,
      listEra: true,
      includeBonus: true,
      separatorType: "token",
    };
    expect(renderValue(vanillaOpts(opts))).toBe(
      golden(recorded, "vanillaOpts"),
    );
    // Options that are not fun options survive untouched.
    expect(vanillaOpts(opts).separatorType).toBe("token");
  });

  it("names the same options the old table did", () => {
    expect(renderValue({ FUN_NAMES, POOL_NAMES })).toBe(
      golden(recorded, "names"),
    );
  });
});

describe("pool statistics", () => {
  const pools = {
    commons: groupByName([
      card({ name: "Bear", rarity: "common", type_line: "Creature — Bear" }),
      card({ name: "Plains", rarity: "common", type_line: "Basic Land — Plains" }),
      card({ name: "Gate", rarity: "common", type_line: "Land" }),
    ]),
    nonBasicLands: groupByName([
      card({ name: "Gate", rarity: "common", type_line: "Land" }),
      card({ name: "Shrine", rarity: "rare", type_line: "Land" }),
      card({ name: "Temple", rarity: "uncommon", type_line: "Land" }),
    ]),
    rares: groupByName([card({ name: "Dragon", rarity: "rare" })]),
    mythics: groupByName([card({ name: "God", rarity: "mythic" })]),
    uncommons: groupByName([card({ name: "Elf", rarity: "uncommon" })]),
    landBasics: groupByName([
      card({ name: "Plains", rarity: "common", type_line: "Basic Land — Plains" }),
    ]),
    landDuals: groupByName([]),
    spg: groupByName([]),
  };

  it("matches the old rarity mix and land share", () => {
    for (const [key, map] of Object.entries(pools))
      expect(
        renderValue({ mix: rarityMix(map), share: landShare(map) }),
        key,
      ).toBe(golden(recorded, `rarityMix ${key}`));
    // A mixed pool spells the mix out; a single-rarity one stays quiet.
    expect(rarityMix(pools.nonBasicLands)).toBe("1 common, 1 uncommon, 1 rare");
    expect(rarityMix(pools.rares)).toBe("");
    expect(landShare(pools.nonBasicLands)).toBe(1);
    expect(landShare(pools.commons)).toBeCloseTo(2 / 3, 12);
  });

  it("matches the old expected land count for every spec", () => {
    const stats = statsFromPools(pools);
    for (const vanilla of [true, false])
      for (let mult = 1; mult <= 5; mult++) {
        const slots = playSpec({ vanilla, mult, listEra: true }, stats);
        expect(
          renderValue(expectedLands(slots, pools)),
          `${vanilla} x${mult}`,
        ).toBe(golden(recorded, `expectedLands ${vanilla} x${mult}`));
      }
  });

  it("returns null without pools, and ignores The List", () => {
    const slots = playSpec({ vanilla: true, mult: 1, listEra: true }, dsk);
    expect(expectedLands(slots, null)).toBeNull();
    // The List has no pool to measure, so it cannot contribute lands.
    expect(expectedLands(slots, pools)).not.toBeNaN();
  });

  it("reports pool counts, fallbacks and mixes for a slot's outcomes", () => {
    const stats = statsFromPools(pools);
    const slots = playSpec({ vanilla: true, mult: 1 }, stats);
    const land = slots.find((s) => s.from === 12) as Slot;
    const basic = poolNote(land.outcomes[0], stats, pools);
    expect(basic.count).toBe(1);
    expect(basic.fellBackTo).toBeNull();

    // landBasics is empty in this fixture's stats? It is not — force a fallback.
    const noBasics = { ...stats, landBasics: 0 };
    const fellBack = poolNote(
      { pool: ["landBasics", "nonBasicLands", "commons"], label: "Basic land", p: 1 },
      noBasics,
      pools,
    );
    expect(fellBack.fellBackTo).toBe("non-basic lands");
    expect(fellBack.count).toBe(3);

    // The List is inexhaustible, so its count reads as unknown rather than ∞.
    expect(poolNote({ pool: "LIST", label: "The List", p: 0.1 }, stats, pools).count)
      .toBeNull();
  });
});

describe("expected chips", () => {
  it("are empty while the set is still loading", () => {
    const slots = playSpec({ vanilla: true, mult: 1 }, null);
    expect(expectedChips(slots, null, null, "play", { vanilla: true, mult: 1 })).toEqual([]);
  });

  it("report rares, mythics and foils for a known set", () => {
    const slots = playSpec({ vanilla: true, mult: 1, listEra: false }, dsk);
    const chips = expectedChips(slots, dsk, null, "play", { vanilla: true, mult: 1 });
    const by = (l: string) => chips.find((c) => c.label === l)?.value;
    expect(by("Rares + mythics")).toBeCloseTo(1.087 + 0.181, 2);
    expect(by("Mythics")).toBeCloseTo(0.181, 3);
    expect(by("Foils")).toBeCloseTo(0.318, 3);
    // No pools passed, so there is no land figure to report.
    expect(by("Lands")).toBeUndefined();
  });

  it("add a legendaries chip on the Commander tab only", () => {
    const slots = commanderSpec("cmr", { vanilla: true, mult: 1 }, dsk);
    const labels = expectedChips(slots, dsk, null, "commander", {
      vanilla: true,
      mult: 1,
    }).map((c) => c.label);
    expect(labels).toContain("Legendaries");
    const playLabels = expectedChips(
      playSpec({ vanilla: true, mult: 1 }, dsk),
      dsk,
      null,
      "play",
      { vanilla: true, mult: 1 },
    ).map((c) => c.label);
    expect(playLabels).not.toContain("Legendaries");
  });

  it("name the separator in the lands chip when one is a land", () => {
    const slots = playSpec({ vanilla: true, mult: 1 }, dsk);
    const pools = { commons: groupByName([card({ type_line: "Land" })]) };
    const chips = expectedChips(slots, dsk, pools, "play", {
      vanilla: true,
      mult: 1,
      includeBonus: true,
      separatorType: "land",
    });
    expect(chips.map((c) => c.label)).toContain("Lands (+1 separator)");
  });
});

describe("slot labelling", () => {
  it("renders single and multi-card ranges", () => {
    const slots = playSpec({ vanilla: true, mult: 1 }, dsk);
    expect(slotRange(slots[0])).toBe("1–6");
    expect(slotRange(slots[1])).toBe("7");
  });

  it("lists the slots an option affects", () => {
    const fun = playSpec({ vanilla: false, mult: 3, listToggle: true }, dsk);
    expect(slotsAffectedBy(fun, "slotUpgrade")).toBe("7, 10");
    expect(slotsAffectedBy(fun, "landUpgrade")).toBe("12");
    expect(slotsAffectedBy(fun, "mult")).toBe("7, 11, 13, 14");
    expect(slotsAffectedBy(playSpec({ vanilla: true, mult: 1 }, dsk), "mult")).toBe("");
  });

  it("gives the last wildcard's foil chance on the Play tab only", () => {
    const play = playSpec({ vanilla: true, mult: 1 }, dsk);
    expect(lastSlotFoilChance(play, "play")).toBeCloseTo(0.101 + 0.0168, 3);
    expect(lastSlotFoilChance(play, "commander")).toBeNull();
    // Unknown while loading, because the odds are not known yet.
    expect(lastSlotFoilChance(playSpec({ vanilla: true, mult: 1 }, null), "play")).toBeNull();
    // A lopsided set still reports a number, just a different one.
    expect(
      lastSlotFoilChance(playSpec({ vanilla: true, mult: 1 }, lopsided), "play"),
    ).toBeGreaterThan(0);
  });
});
