/*
 * Properties of the pack logic, asserted directly rather than by comparison.
 *
 * Parity says the port matches the old code. These say the logic is right, so
 * they outlive phase 6 when the old app and the parity harness go. Several of
 * them are here because the behaviour they pin down looks like a bug and is
 * not — the places where a future reader would be tempted to "fix" something.
 */
import { describe, expect, it } from "vitest";

import {
  commanderSpec,
  diffFromVanilla,
  expectedCounts,
  godPackSpec,
  isDoubleFacedToken,
  mythicShare,
  nonFoilMap,
  nonFoilPools,
  nonFoilPrintings,
  pickFromMap,
  playSpec,
  tokenSheets,
} from "@/lib/booster";
import type {
  Card as PureCard,
  CommanderLayout,
  PlayOptions,
  Slot,
  Stats,
} from "@/lib/booster/types";
import { vanillaOpts } from "@/lib/explain";
import { specOptions } from "@/lib/options";
import { DEFAULT_OPTIONS } from "@/store/options";

import {
  commanderBorrowed,
  commanderFull,
  dsk,
  lopsided,
  noMythics,
  noRares,
  seededRng,
  sparse,
  statsCases,
  tokenFixture,
} from "./fixtures";

const LAYOUTS: CommanderLayout[] = ["cmr", "clb", "cmm"];

const pct = (p: number | null) => Math.round((p as number) * 1000) / 10;
const outcome = (slot: Slot, label: string) =>
  slot.outcomes.find((o) => o.label === label);

describe("the vanilla diff", () => {
  /* The test that catches a broken diff: nothing differs from itself. */
  it("reports exactly 0 changes for Play compared with itself", () => {
    for (const [name, stats] of statsCases) {
      const spec = playSpec({ vanilla: true, mult: 1, listEra: true }, stats);
      const changes = diffFromVanilla(spec, spec).flat();
      expect(changes, name).toEqual([]);
    }
  });

  it("reports exactly 0 changes for all three Commander layouts", () => {
    for (const [name, stats] of statsCases)
      for (const layout of LAYOUTS) {
        const spec = commanderSpec(layout, { vanilla: true, mult: 1 }, stats);
        expect(diffFromVanilla(spec, spec).flat(), `${name} ${layout}`).toEqual(
          [],
        );
      }
  });

  it("reports the changes fun mode actually makes", () => {
    const fun = playSpec({ vanilla: false, mult: 3 }, dsk);
    const vanilla = playSpec({ vanilla: true, mult: 3 }, dsk);
    const changes = diffFromVanilla(fun, vanilla);
    // Slot 7 is upgraded to an uncommon: the common goes, an uncommon arrives.
    const slot7 = changes[1];
    expect(slot7.some((c) => c.kind === "title")).toBe(true);
    expect(
      slot7.some((c) => c.kind === "removed" && c.label === "Common"),
    ).toBe(true);
    expect(changes.flat().length).toBeGreaterThan(0);
  });
});

describe("the mythic share", () => {
  it("is M ÷ (2R + M) from the set's own pools, not a flat constant", () => {
    expect(mythicShare(dsk, "rares", "mythics").p).toBeCloseTo(
      20 / (2 * 60 + 20),
      12,
    );
    // 1 rare and 3 mythics gives 60% — the case that exposed the old 13%.
    expect(mythicShare(lopsided, "rares", "mythics").p).toBeCloseTo(0.6, 12);
    expect(mythicShare(noMythics, "rares", "mythics").p).toBe(0);
    expect(mythicShare(noRares, "rares", "mythics").p).toBe(1);
    expect(mythicShare(null, "rares", "mythics").p).toBeNull();
  });

  it("is neutral at x1: fun slot 11 equals vanilla slot 11", () => {
    for (const [name, stats] of statsCases) {
      const fun = playSpec({ vanilla: false, mult: 1 }, stats);
      const vanilla = playSpec({ vanilla: true, mult: 1 }, stats);
      const funSlot = fun.find((s) => s.from === 11) as Slot;
      const vanSlot = vanilla.find((s) => s.from === 11) as Slot;
      expect(funSlot.title, name).toBe("Rare or mythic");
      expect(vanSlot.title, name).toBe("Rare or mythic");
      expect(
        funSlot.outcomes.map((o) => [o.label, o.p]),
        name,
      ).toEqual(vanSlot.outcomes.map((o) => [o.label, o.p]));
    }
  });

  /*
   * A decision, not an accident: "x3 means three times the mythics" is the
   * intuitive promise, so the multiplier multiplies the share literally and
   * clamps at 100%. Odds-ratio scaling was offered and declined.
   */
  it("multiplies literally and clamps at 100%", () => {
    const share = 20 / (2 * 60 + 20); // 14.2857%
    for (const mult of [1, 2, 3, 4, 5]) {
      const slot = playSpec({ vanilla: false, mult }, dsk).find(
        (s) => s.from === 11,
      ) as Slot;
      expect(outcome(slot, "Mythic")?.p).toBeCloseTo(
        Math.min(1, share * mult),
        12,
      );
    }
    // 60% × 2 clamps to 100%, and the rare is then dropped entirely.
    const clamped = playSpec({ vanilla: false, mult: 2 }, lopsided).find(
      (s) => s.from === 11,
    ) as Slot;
    expect(outcome(clamped, "Mythic")?.p).toBe(1);
    expect(outcome(clamped, "Rare")).toBeUndefined();
  });

  it("gives every multiplier step x1-x5 a different spec", () => {
    for (const [name, stats] of [
      ["dsk", dsk],
      ["lopsided", lopsided],
    ] as const) {
      const seen = [1, 2, 3, 4, 5].map((mult) =>
        JSON.stringify(playSpec({ vanilla: false, mult }, stats)),
      );
      expect(new Set(seen).size, name).toBe(5);
    }
  });
});

describe("slot order is the real pack order", () => {
  /*
   * Wizards' "What Are Play Boosters?" order: 11 rare/mythic, 12 land,
   * 13 wildcard, 14 wildcard with a foil if it is a rare or mythic. The
   * mtg.fandom wiki contradicts this; Wizards is the one followed.
   *
   * Fun mode uses the same positions so a fun pack is laid out like a real one
   * and the land never lands next to the separator land that follows a pack.
   */
  const titlesAt = (spec: Slot[]) =>
    [11, 12, 13, 14].map(
      (pos) => spec.find((s) => pos >= s.from && pos <= s.to)?.title,
    );

  it("in vanilla", () => {
    expect(titlesAt(playSpec({ vanilla: true, mult: 1 }, dsk))).toEqual([
      "Rare or mythic",
      "Land",
      "Wildcard (non-foil)",
      "Wildcard (foil if rare or mythic)",
    ]);
  });

  it("in fun mode", () => {
    expect(titlesAt(playSpec({ vanilla: false, mult: 3 }, dsk))).toEqual([
      "Rare or mythic",
      "Land (upgraded)",
      "Wildcard",
      "Wildcard (foil if rare or mythic)",
    ]);
  });

  it("over 14 cards, with no gaps and no overlaps", () => {
    const specs: Slot[][] = [];
    for (const [, stats] of statsCases)
      for (const vanilla of [true, false])
        for (let mult = 1; mult <= 5; mult++)
          specs.push(playSpec({ vanilla, mult, listEra: true }, stats));
    for (const spec of specs) {
      let pos = 1;
      for (const s of spec) {
        expect(s.from).toBe(pos);
        expect(s.to).toBe(pos + s.n - 1);
        pos = s.to + 1;
      }
      expect(pos - 1).toBe(14);
    }
  });

  /*
   * A decision, not an accident: slot 10 in fun mode is a flat rare and never
   * a mythic. The point of the upgrade was rares; slot 11 already carries the
   * mythic chance.
   */
  it("makes fun slot 10 a flat rare, never a mythic", () => {
    for (const [name, stats] of statsCases)
      for (let mult = 1; mult <= 5; mult++) {
        const slot = playSpec({ vanilla: false, mult }, stats).find(
          (s) => s.from === 10,
        ) as Slot;
        expect(slot.title, name).toBe("Rare");
        // A set with no rares cannot fill the slot, and the outcome is
        // dropped rather than silently promoted to a mythic.
        if (stats && stats.rares === 0) {
          expect(slot.outcomes, name).toEqual([]);
          continue;
        }
        expect(slot.outcomes.map((o) => o.label), name).toEqual(["Rare"]);
        expect(slot.outcomes[0].foil, name).toBe(0);
      }
  });
});

describe("foils", () => {
  /*
   * The 2027 rules removed foil commons and uncommons from Booster Packs, so a
   * foil in a pack is always a rare or mythic and most packs have none.
   */
  it("never appear on a common or uncommon in a vanilla pack", () => {
    for (const [name, stats] of statsCases) {
      const spec = playSpec({ vanilla: true, mult: 1, listEra: true }, stats);
      // Exact labels: "Common dual land" is a land, not a common, and the
      // land slot keeps its own 20% foil.
      const nonFoil = ["Common", "Uncommon", "The List", "Special Guest"];
      for (const slot of spec)
        for (const o of slot.outcomes) {
          if (nonFoil.includes(o.label))
            expect(o.foil || 0, `${name} ${slot.title} ${o.label}`).toBe(0);
        }
    }
  });

  /*
   * A decision, not an accident: the land slot keeps its 20% foil. Wizards'
   * announcement is silent on the land slot, and Collector Booster God Packs
   * still list a foil land, so the published rate stands rather than a guess.
   */
  it("stay at 20% on the vanilla land slot", () => {
    const land = playSpec({ vanilla: true, mult: 1 }, dsk).find(
      (s) => s.from === 12,
    ) as Slot;
    expect(land.title).toBe("Land");
    for (const o of land.outcomes) expect(o.foil).toBe(0.2);
  });

  it("are the rare and mythic outcomes of the last vanilla wildcard", () => {
    const slot = playSpec({ vanilla: true, mult: 1 }, dsk).find(
      (s) => s.from === 14,
    ) as Slot;
    expect(outcome(slot, "Common")?.foil).toBe(0);
    expect(outcome(slot, "Uncommon")?.foil).toBe(0);
    expect(outcome(slot, "Rare")?.foil).toBe(1);
    expect(outcome(slot, "Mythic")?.foil).toBe(1);
  });

  it("cover any rarity in fun mode only when the toggle is on", () => {
    const off = playSpec({ vanilla: false, mult: 2, foilToggle: false }, dsk)
      .find((s) => s.from === 14) as Slot;
    expect(off.title).toBe("Wildcard (foil if rare or mythic)");
    expect(outcome(off, "Uncommon")?.foil).toBe(0);
    expect(outcome(off, "Rare")?.foil).toBe(1);

    const on = playSpec({ vanilla: false, mult: 2, foilToggle: true }, dsk)
      .find((s) => s.from === 14) as Slot;
    expect(on.title).toBe("Wildcard (foil)");
    for (const o of on.outcomes) expect(o.foil).toBe(1);
  });
});

/*
 * `noFoils` is for a printer that cannot make a foil. It is a printing
 * preference, not an odds change, which is what these pin down: every slot
 * still fills, every rarity keeps its chance, and only the finish moves —
 * except for foil-etched, which is a separate printing and has to go.
 */
describe("no foils", () => {
  const everyOutcome = (spec: Slot[]) => spec.flatMap((s) => s.outcomes);
  const sums = (spec: Slot[]) =>
    spec.map((s) => s.outcomes.reduce((a, o) => a + (o.p as number), 0));

  it("leaves no foil anywhere in a Play pack, vanilla or fun", () => {
    for (const [name, stats] of statsCases)
      for (const opts of [
        { vanilla: true, mult: 1, listEra: true },
        { vanilla: false, mult: 3, foilToggle: true, listToggle: true },
      ] as PlayOptions[]) {
        const spec = playSpec({ ...opts, noFoils: true }, stats);
        for (const o of everyOutcome(spec))
          expect(o.foil || 0, `${name} ${o.label}`).toBe(0);
      }
  });

  it("leaves no foil anywhere in a Commander pack, in any layout", () => {
    for (const layout of LAYOUTS) {
      const spec = commanderSpec(
        layout,
        { vanilla: true, mult: 1, noFoils: true },
        commanderFull,
      );
      for (const o of everyOutcome(spec))
        expect(o.foil || 0, `${layout} ${o.label}`).toBe(0);
    }
  });

  it("leaves no foil in a God Pack", () => {
    for (const o of everyOutcome(godPackSpec(dsk, true)))
      expect(o.foil || 0).toBe(0);
    // Still two Booster Fun slots: only their finish was foil.
    expect(godPackSpec(dsk, true).reduce((a, s) => a + s.n, 0)).toBe(14);
  });

  /*
   * The foil slot is still a slot. Dropping a card from it, rather than its
   * finish, would make the pack 13 cards.
   */
  it("keeps every slot and every card position", () => {
    const withFoils = playSpec({ vanilla: true, mult: 1 }, dsk);
    const without = playSpec({ vanilla: true, mult: 1, noFoils: true }, dsk);
    expect(without.length).toBe(withFoils.length);
    expect(without.map((s) => [s.from, s.to])).toEqual(
      withFoils.map((s) => [s.from, s.to]),
    );
  });

  /*
   * Foil-etched is not a finish but a printing of its own, out of the
   * `etched` pool, so it is dropped outright — and its 1-in-15 share has to
   * land back on the rest or the slot stops summing to 1.
   */
  it("drops Commander Legends' foil-etched legend and redistributes it", () => {
    const slotOf = (noFoils: boolean) =>
      commanderSpec("cmr", { vanilla: true, mult: 1, noFoils }, commanderFull)
        .find((s) => s.from === 20) as Slot;

    const kept = slotOf(false);
    expect(outcome(kept, "Foil-etched legend")?.foil).toBe("etched");

    const gone = slotOf(true);
    expect(outcome(gone, "Foil-etched legend")).toBeUndefined();
    expect(gone.title).toBe("Wildcard (the foil slot)");

    // Every rarity keeps its share of the slot, scaled back up to fill it.
    for (const label of ["Common", "Uncommon", "Rare", "Mythic"]) {
      const before = outcome(kept, label)?.p as number;
      const after = outcome(gone, label)?.p as number;
      expect(after).toBeGreaterThan(before);
      expect(after).toBeCloseTo(before / (1 - 1 / 15), 10);
    }
  });

  it("leaves every slot summing to 1", () => {
    for (const sum of sums(playSpec({ vanilla: true, mult: 1, noFoils: true }, dsk)))
      expect(sum).toBeCloseTo(1, 10);
    for (const layout of LAYOUTS)
      for (const sum of sums(
        commanderSpec(layout, { vanilla: true, mult: 1, noFoils: true }, commanderFull),
      ))
        expect(sum).toBeCloseTo(1, 10);
  });

  /*
   * Only the finish differs, so the rarity odds have to be untouched. This is
   * the claim the option rests on: you lose the foil, not the card.
   */
  it("changes no rarity odds at all", () => {
    for (const [name, stats] of statsCases) {
      const withFoils = playSpec({ vanilla: true, mult: 1 }, stats);
      const without = playSpec({ vanilla: true, mult: 1, noFoils: true }, stats);
      const strip = (spec: Slot[]) =>
        spec.map((s) =>
          s.outcomes.map((o) => `${o.label}=${o.p}`).join(","),
        );
      expect(strip(without), name).toEqual(strip(withFoils));
    }
  });

  /*
   * The printings that exist only as a foil. These are not ordinary cards
   * with a shiny finish but separate printings with their own treatment, so
   * "print it non-foil" asks for something that was never made — and the
   * treatment would show up in the PDF.
   *
   * The shape here is Overgrown Tomb's real one: 20 printings, 5 of them
   * foil-only (surge foil, box topper, serialized, galaxy foil, Expedition).
   */
  describe("foil-only printings", () => {
    const printing = (n: string, finishes?: string[]) =>
      ({ name: "Overgrown Tomb", collector_number: n, finishes }) as PureCard;
    const normal = printing("96", ["nonfoil", "foil"]);
    const surge = printing("494", ["foil"]);
    const etchedOnly = printing("31", ["etched"]);
    const noField = printing("1");

    it("are dropped, and ordinary and unknown printings are kept", () => {
      expect(nonFoilPrintings([normal, surge, etchedOnly, noField])).toEqual([
        normal,
        noField,
      ]);
    });

    it("are kept when a name has nothing else, rather than losing the card", () => {
      expect(nonFoilPrintings([surge, etchedOnly])).toEqual([
        surge,
        etchedOnly,
      ]);
    });

    it("go from every pool while every name stays", () => {
      const pools = {
        commons: new Map([
          ["Overgrown Tomb", [normal, surge]],
          ["Surge Only", [surge]],
        ]),
        meta: { boosterFiltered: true, ownSpg: 0, landSlotOnly: 0 },
      };
      const out = nonFoilPools(pools);
      const commons = out.commons as Map<string, PureCard[]>;
      expect([...commons.keys()]).toEqual(["Overgrown Tomb", "Surge Only"]);
      expect(commons.get("Overgrown Tomb")).toEqual([normal]);
      // Nothing else to print, so the name keeps what it has.
      expect(commons.get("Surge Only")).toEqual([surge]);
      // `meta` is not a pool and must come through untouched.
      expect(out.meta).toBe(pools.meta);
    });

    it("never come out of a pool once it has been narrowed", () => {
      const many = [
        ...Array.from({ length: 15 }, (_, i) =>
          printing(String(i), ["nonfoil", "foil"]),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          printing(`f${i}`, ["foil"]),
        ),
      ];
      const narrowed = nonFoilMap(new Map([["Overgrown Tomb", many]]));
      const rng = seededRng(7);
      for (let i = 0; i < 400; i++) {
        const drawn = pickFromMap(narrowed, rng);
        expect(drawn?.finishes).toContain("nonfoil");
      }
    });
  });

  it("is not switched off by vanilla mode, the way fun options are", () => {
    const opts = specOptions({
      mode: "play",
      options: { ...DEFAULT_OPTIONS, vanilla: true, foilToggle: true },
      released: "2024-09-27",
      noFoils: true,
    });
    expect(opts.vanilla).toBe(true);
    expect(opts.foilToggle).toBe(false);
    expect(opts.noFoils).toBe(true);
    expect(vanillaOpts(opts).noFoils).toBe(true);
  });
});

describe("The List era", () => {
  /*
   * A different axis from the 2027 rules, and still correct for the MKM to
   * Bloomburrow sets: slot 7 could hold a card from The List then, and cannot
   * from Duskmourn on.
   */
  it("puts The List in vanilla slot 7 only inside the era", () => {
    const inEra = playSpec({ vanilla: true, mult: 1, listEra: true }, dsk).find(
      (s) => s.from === 7,
    ) as Slot;
    expect(inEra.title).toBe("Common / The List / Special Guest");
    expect(pct(outcome(inEra, "The List")?.p ?? null)).toBe(10.9);
    expect(pct(outcome(inEra, "Special Guest")?.p ?? null)).toBe(1.6);

    const after = playSpec(
      { vanilla: true, mult: 1, listEra: false },
      dsk,
    ).find((s) => s.from === 7) as Slot;
    expect(after.title).toBe("Common or Special Guest");
    expect(outcome(after, "The List")).toBeUndefined();
  });

  it("is a fun override independent of the era", () => {
    const opts: PlayOptions = { vanilla: false, mult: 1, listToggle: true, listEra: false };
    const slot = playSpec(opts, dsk).find((s) => s.from === 7) as Slot;
    expect(slot.title).toBe("Uncommon / The List / Special Guest");
    expect(pct(outcome(slot, "The List")?.p ?? null)).toBe(12.5);
  });
});

describe("God Packs", () => {
  const spec = godPackSpec(dsk);

  it("are 14 cards, all rare or mythic", () => {
    expect(spec.reduce((a, s) => a + s.n, 0)).toBe(14);
    for (const slot of spec)
      for (const o of slot.outcomes) expect(["Rare", "Mythic"]).toContain(o.label);
  });

  it("hold exactly 2 foils and 4 Booster Fun cards", () => {
    const exp = expectedCounts(spec);
    expect(exp.__foil).toBeCloseTo(2, 12);
    const boosterFun = spec.reduce(
      (a, s) =>
        a + s.outcomes.reduce((b, o) => b + (o.boosterFun ? s.n * (o.p as number) : 0), 0),
      0,
    );
    expect(boosterFun).toBeCloseTo(4, 12);
  });

  /*
   * A decision, not an accident: the ten plain slots use the normal random
   * printing rule, so some of them come out Booster Fun anyway. Forcing
   * default frames there would contradict how every other slot picks a
   * printing, so those slots carry no treatment flag at all.
   */
  it("leave the ten plain slots to the normal random-printing rule", () => {
    const plain = spec.find((s) => s.n === 10) as Slot;
    for (const o of plain.outcomes) expect(o.boosterFun).toBeUndefined();
  });

  it("keep the mythic share of the set they come from", () => {
    for (const [name, stats] of statsCases) {
      const gp = godPackSpec(stats);
      const share = mythicShare(stats, "rares", "mythics").p;
      for (const slot of gp)
        expect(outcome(slot, "Mythic")?.p ?? share, name).toBeCloseTo(
          share ?? 0,
          12,
        );
    }
  });
});

describe("token separator sheets", () => {
  const perPage = 9;
  const key = (c: { collector_number?: string }) => String(c.collector_number);
  const allNumbers = tokenFixture.map(key);

  it("cover every distinct token, kept apart by collector number", () => {
    /*
     * Duskmourn prints two different Spirits (#6, #8) and two Insects (#5,
     * #13). Every other pool in the app groups by name; this is the one place
     * that would silently halve the set.
     */
    expect(new Set(allNumbers).size).toBe(tokenFixture.length);
    expect(new Set(tokenFixture.map((c) => c.name)).size).toBeLessThan(
      tokenFixture.length,
    );

    const sheets = tokenSheets(tokenFixture, perPage, seededRng(42));
    const placed = sheets
      .flat()
      .filter((s) => !s.filler)
      .flatMap((s) => [key(s.card), s.backCard ? key(s.backCard) : null]);
    for (const n of allNumbers) expect(placed).toContain(n);
  });

  it("place each token exactly once when they pair up evenly", () => {
    // Drop the double-faced token, leaving 8 singles: four exact pairs.
    const even = tokenFixture.filter((t) => !isDoubleFacedToken(t)).slice(0, 8);
    const placed = tokenSheets(even, 4, seededRng(1))
      .flat()
      .filter((s) => !s.filler)
      .flatMap((s) => [key(s.card), key(s.backCard!)]);
    expect(placed.sort()).toEqual(even.map(key).sort());
  });

  it("fill every page and back every slot", () => {
    for (const pp of [1, 2, 4, 8, 9, 18])
      for (let seed = 1; seed <= 10; seed++) {
        const sheets = tokenSheets(tokenFixture, pp, seededRng(seed));
        for (const sheet of sheets) expect(sheet).toHaveLength(pp);
        for (const slot of sheets.flat()) {
          // A double-faced token brings its own back; everything else is paired.
          if (isDoubleFacedToken(slot.card)) expect(slot.backCard).toBeUndefined();
          else expect(slot.backCard).toBeTruthy();
        }
      }
  });

  it("keep collector-number order and give a set with no tokens no sheets", () => {
    const sheets = tokenSheets(tokenFixture, 18, seededRng(5));
    const fronts = sheets.flat().filter((s) => !s.filler).map((s) => s.card);
    expect(fronts[0].collector_number).toBe("1");
    expect(tokenSheets([], 9, seededRng(1))).toEqual([]);
  });
});

describe("a set that is still loading", () => {
  /* `stats = null` must not throw anywhere, and must produce no numbers. */
  it("produces specs with null probabilities and no exceptions", () => {
    const specs: Slot[][] = [];
    for (const vanilla of [true, false])
      for (let mult = 1; mult <= 5; mult++) {
        specs.push(playSpec({ vanilla, mult, listEra: true, listToggle: true, foilToggle: true }, null));
        for (const layout of LAYOUTS)
          specs.push(commanderSpec(layout, { vanilla, mult }, null));
      }
    specs.push(godPackSpec(null));

    for (const spec of specs) {
      expect(spec.length).toBeGreaterThan(0);
      for (const slot of spec) {
        // Nothing is dropped or renormalised while the counts are unknown.
        expect(slot.outcomes.length).toBeGreaterThan(0);
        for (const o of slot.outcomes) {
          /*
           * Only the pool-derived odds are unknown. Rates that do not depend
           * on what is in the set — 1 in 64 Special Guests, half the land
           * slots, 1 in 6 Prismatic Pipers — are still exactly themselves.
           */
          if (o.formula && /cards|share|mythic share/.test(o.formula))
            expect(o.p, `${slot.title} ${o.label}`).toBeNull();
          else expect(o.p, `${slot.title} ${o.label}`).not.toBeUndefined();
        }
      }
      expect(() => diffFromVanilla(spec, spec)).not.toThrow();
      expect(() => expectedCounts(spec)).not.toThrow();
    }

    // The rare-or-mythic slot is entirely pool-derived, so it is all nulls.
    const loading = playSpec({ vanilla: true, mult: 1 }, null).find(
      (s) => s.from === 11,
    ) as Slot;
    expect(loading.outcomes.map((o) => o.p)).toEqual([null, null]);
  });
});

describe("sets missing a pool", () => {
  it("drop the empty outcome and renormalise the rest", () => {
    // `sparse` has no common duals, so the land slot is all basics.
    const land = playSpec({ vanilla: true, mult: 1 }, sparse).find(
      (s) => s.from === 12,
    ) as Slot;
    expect(land.outcomes.map((o) => o.label)).toEqual(["Basic land"]);
    expect(land.outcomes[0].p).toBe(1);
  });

  it("still fill every guaranteed Commander slot through the fallbacks", () => {
    // `commanderBorrowed` is an ordinary set used with a Commander layout: no
    // Backgrounds, no Piper, no etched legends, and no uncommon legends, so
    // every legendary slot has to walk down its fallback chain.
    for (const layout of LAYOUTS) {
      const spec = commanderSpec(
        layout,
        { vanilla: true, mult: 1 },
        commanderBorrowed as Stats,
      );
      for (const slot of spec) {
        expect(slot.outcomes.length, `${layout} ${slot.title}`).toBeGreaterThan(0);
        const total = slot.outcomes.reduce((a, o) => a + (o.p as number), 0);
        expect(total, `${layout} ${slot.title}`).toBeCloseTo(1, 12);
      }
    }
  });

  it("sum every fillable slot to 1, and empty the rest", () => {
    for (const [name, stats] of statsCases) {
      if (!stats) continue;
      for (const vanilla of [true, false])
        for (let mult = 1; mult <= 5; mult++)
          for (const slot of playSpec({ vanilla, mult, listEra: true }, stats)) {
            const where = `${name} ${vanilla} x${mult} ${slot.title}`;
            const total = slot.outcomes.reduce((a, o) => a + (o.p as number), 0);
            // A slot whose every pool is empty is dropped whole; anything
            // left is renormalised to exactly 1.
            if (slot.outcomes.length === 0) expect(total, where).toBe(0);
            else expect(total, where).toBeCloseTo(1, 12);
          }
    }
  });

  it("empties only the slots whose pools the set really lacks", () => {
    // `noRares` has mythics but no rares, so the fun rare slot is the one
    // thing it cannot fill.
    const spec = playSpec({ vanilla: false, mult: 1 }, noRares);
    const emptied = spec.filter((s) => s.outcomes.length === 0);
    expect(emptied.map((s) => s.title)).toEqual(["Rare"]);
    // Everything else still works, including the mythic-only rare slot.
    const rm = spec.find((s) => s.from === 11) as Slot;
    expect(rm.outcomes.map((o) => o.label)).toEqual(["Mythic"]);
    expect(rm.outcomes[0].p).toBe(1);
  });

  it("gives a Commander booster from an ordinary set its legends by fallback", () => {
    const spec = commanderSpec("cmm", { vanilla: true, mult: 1 }, commanderFull);
    const legU = spec.find((s) => s.title === "Legendary uncommon") as Slot;
    expect(legU.outcomes[0].pool).toEqual([
      "legU",
      "legC",
      "legAll",
      "uncommons",
    ]);
  });
});
