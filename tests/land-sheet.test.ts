/*
 * The land sheet: one page of the set's basic lands.
 *
 * The fixtures copy what real sets hold, because the shape of the answer
 * depends on it. A set's "full-art lands" are not a separate cycle of cards —
 * `s:dsk t:land is:fullart` answers with five cards named Plains, Island,
 * Swamp, Mountain and Forest. They are the basics again in another treatment,
 * which is why they are the right thing to spend a spare slot on.
 */
import { describe, expect, it } from "vitest";

import { buildLandSheet, isBasicLand } from "@/lib/booster";
import type { Card, Slot } from "@/lib/booster/types";
import { allPacksLabel, generatePacks, packName } from "@/lib/generate";

import { seededRng } from "./fixtures";

const BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

const land = (
  name: string,
  n: number,
  extra: Partial<Card> = {},
): Card =>
  ({
    id: `${name}-${n}`,
    name,
    collector_number: String(n),
    type_line: BASICS.includes(name)
      ? `Basic Land — ${name}`
      : "Land — Test",
    ...extra,
  }) as Card;

/** Duskmourn's shape: 5 basics × 3 arts, one art of each full-art. */
function duskmourn(): Card[] {
  const out: Card[] = [];
  let n = 260;
  for (const name of BASICS) {
    out.push(land(name, n++));
    out.push(land(name, n++));
    out.push(land(name, n++, { full_art: true }));
  }
  // The set's nonbasic lands, which the packs already give you.
  for (let i = 0; i < 17; i++) out.push(land(`Utility Land ${i}`, 200 + i));
  return out;
}

const names = (sheet: Card[]) => sheet.map((c) => c.name);

describe("the land sheet", () => {
  it("is one page of nine", () => {
    expect(buildLandSheet(duskmourn(), 9)).toHaveLength(9);
  });

  it("holds every basic land in the set before anything else", () => {
    const sheet = buildLandSheet(duskmourn(), 9);
    for (const name of BASICS) expect(names(sheet)).toContain(name);
    // The five basics come first, in collector-number order.
    expect(names(sheet).slice(0, 5)).toEqual(BASICS);
    // One of each before a second of any.
    expect(new Set(names(sheet).slice(0, 5)).size).toBe(5);
  });

  it("leads with the full-art printing of each basic", () => {
    const sheet = buildLandSheet(duskmourn(), 9);
    for (const c of sheet.slice(0, 5)) expect(c.full_art, c.name).toBe(true);
  });

  it("holds nothing but basic lands", () => {
    for (const c of buildLandSheet(duskmourn(), 9))
      expect(isBasicLand(c), c.name).toBe(true);
  });

  /*
   * The bug the first version shipped with: filling name by name gave three
   * Plains, three Islands and no second Forest. A page of lands for building
   * a deck has to spread across the types.
   */
  it("spreads the spare slots across the types, not down one of them", () => {
    const counts = new Map<string, number>();
    for (const c of buildLandSheet(duskmourn(), 9))
      counts.set(c.name as string, (counts.get(c.name as string) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...BASICS].sort());
    // Nine cards over five types: four types twice, one once.
    expect([...counts.values()].sort()).toEqual([1, 2, 2, 2, 2]);
  });

  it("never prints the same printing twice", () => {
    const sheet = buildLandSheet(duskmourn(), 9);
    const numbers = sheet.map((c) => c.collector_number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  /*
   * Final Fantasy has six basic names, so one fewer slot is left to fill.
   */
  it("makes room for a sixth basic when the set has one", () => {
    const six = [...BASICS, "Wastes"].flatMap((name, i) => [
      land(name, 300 + i * 2, {
        type_line: `Basic Land${name === "Wastes" ? "" : ` — ${name}`}`,
      }),
      land(name, 301 + i * 2, {
        type_line: `Basic Land${name === "Wastes" ? "" : ` — ${name}`}`,
        full_art: true,
      }),
    ]);
    const sheet = buildLandSheet(six, 9);
    expect(sheet).toHaveLength(9);
    expect(new Set(names(sheet)).size).toBe(6);
  });

  it("falls back to other basic printings when full-art runs out", () => {
    const plain = BASICS.flatMap((name, i) => [
      land(name, 400 + i * 2),
      land(name, 401 + i * 2),
    ]);
    const sheet = buildLandSheet(plain, 9);
    expect(sheet).toHaveLength(9);
    for (const c of sheet) expect(isBasicLand(c)).toBe(true);
  });

  /*
   * A set with too few lands leaves the page part-full rather than repeating
   * a card: the second copy would print exactly the same image.
   */
  it("leaves the page short rather than repeating a card", () => {
    const sheet = buildLandSheet([land("Plains", 1), land("Island", 2)], 9);
    expect(names(sheet)).toEqual(["Plains", "Island"]);
  });

  it("is empty for a set with no lands", () => {
    expect(buildLandSheet([], 9)).toEqual([]);
  });
});

describe("a run with a land sheet", () => {
  const pack = (name: string): Card =>
    ({ id: name, name, collector_number: "1", type_line: "Creature" }) as Card;

  const slot: Slot = {
    n: 2,
    title: "Common",
    outcomes: [{ pool: "commons", label: "Common", p: 1, foil: 0 }],
    from: 1,
    to: 2,
  };

  async function run(landSheet: boolean, lands = duskmourn()) {
    return generatePacks({
      setCode: "DSK",
      mode: "play",
      layoutTag: "",
      packCount: 2,
      opts: { vanilla: true, guest: false, tokenSheets: false, landSheet },
      pools: { commons: new Map([["A", [pack("A")]], ["B", [pack("B")]]]) },
      slots: [slot],
      godSlots: null,
      rng: seededRng(2),
      bonusPick: null,
      separatorIsToken: false,
      // The pure `Card` the sheet works in, widened to the Scryfall one the
      // generator takes, as the other generator tests do.
      loadLands: async () => lands as never,
      fetchList: () => Promise.reject(new Error("not used")),
      log: () => {},
      onWarn: () => {},
    });
  }

  it("adds one sheet after the packs, and nothing when it is off", async () => {
    const off = await run(false);
    expect(off.landSheetCount).toBe(0);
    expect(off.packs).toHaveLength(2);

    const on = await run(true);
    expect(on.landSheetCount).toBe(1);
    expect(on.packs).toHaveLength(3);
    expect(on.packs[2].landSheet).toBe(1);
    expect(on.packs[2].cards).toHaveLength(9);
  });

  it("names the file and the row after it", async () => {
    const { packs, exportFiles } = await run(true);
    expect(exportFiles.base).toEqual([
      "DSK-AllBoosters-2",
      "DSK-Booster-1",
      "DSK-Booster-2",
      "DSK-LandSheet-1",
    ]);
    expect(packName(packs[2], 2)).toBe("Land sheet 1");
    expect(allPacksLabel(packs)).toBe("All 2 packs + 1 land sheet");
  });

  it("is single-sided, so each land gets a real card back", async () => {
    const { packs } = await run(true);
    for (const entry of packs[2].cards) {
      expect(entry.backCard).toBeUndefined();
      expect(entry.tokenSlot).toBeUndefined();
      expect(entry.finish).toBe("nonfoil");
    }
  });

  /*
   * Always, whatever the printing option says: this is a page you print, and
   * a surge-foil basic printed flat is the same art in the wrong frame.
   */
  it("leaves out printings that exist only as a foil", async () => {
    const withSurge = [
      ...duskmourn(),
      ...BASICS.map((name, i) =>
        land(name, 500 + i, { full_art: true, finishes: ["foil"] }),
      ),
    ];
    const { packs } = await run(true, withSurge);
    for (const entry of packs[2].cards)
      expect(Number(entry.card.collector_number)).toBeLessThan(500);
  });

  it("writes the sheet into the CSV as its own file", async () => {
    const { exportFiles } = await run(true);
    const rows = exportFiles.csv[3].split("\n").slice(1).filter((r) => r.trim());
    expect(rows).toHaveLength(9);
    for (const r of rows) expect(r).toContain("nonfoil");
  });
});
