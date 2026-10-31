/*
 * The set picker's selection logic.
 *
 * Extracted from `js/main.js`, where it was tangled up with HTML strings and so
 * could not be tested at all. The default-set rule in particular has already
 * been got wrong once and is explicitly marked "do not simplify" in the plan.
 */
import { describe, expect, it } from "vitest";

import { COMMANDER_SETS } from "@/lib/booster";
import {
  anySets,
  byNewest,
  defaultSet,
  groupByRelease,
  playSets,
  setLabel,
} from "@/lib/scryfall/sets";
import type { ScryfallSet } from "@/lib/scryfall/types";

const TODAY = "2026-10-30";

const set = (
  code: string,
  name: string,
  set_type: string,
  released_at?: string,
): ScryfallSet => ({ code, name, set_type, released_at });

/**
 * A listing shaped like Scryfall's on 30 October 2026: the newest released set
 * is Mystery Booster Commander Edition, which is unopenable as a draft pack.
 */
const listing: ScryfallSet[] = [
  set("fut", "A Future Set", "expansion", "2027-03-01"),
  set("nod", "No Date Announced", "expansion"),
  set("mbc", "Mystery Booster Commander Edition", "masters", "2026-10-24"),
  set("mdd", "Marvel: Darkhold Destiny", "expansion", "2026-09-26"),
  set("dsk", "Duskmourn", "expansion", "2024-09-27"),
  set("blb", "Bloomburrow", "expansion", "2024-08-02"),
  set("cmm", "Commander Masters", "masters", "2023-08-04"),
  set("spg", "Special Guests", "promo", "2024-02-09"),
  set("plst", "The List", "masters", "2024-02-09"),
  set("tdsk", "Duskmourn Tokens", "token", "2024-09-27"),
];

describe("ordering", () => {
  it("puts the newest first and sets with no date last", () => {
    expect([...listing].sort(byNewest).map((s) => s.code)).toEqual([
      "fut",
      "mbc",
      "mdd",
      "dsk",
      "tdsk",
      "blb",
      "plst",
      "spg",
      "cmm",
      "nod",
    ]);
  });

  it("breaks ties by code, so the order is stable", () => {
    const a = set("aaa", "A", "expansion", "2024-01-01");
    const b = set("bbb", "B", "expansion", "2024-01-01");
    expect([b, a].sort(byNewest).map((s) => s.code)).toEqual(["aaa", "bbb"]);
    expect([a, b].sort(byNewest).map((s) => s.code)).toEqual(["aaa", "bbb"]);
  });
});

describe("which sets the pickers offer", () => {
  it("keeps only openable three-letter sets, newest first", () => {
    // "spg" and "tdsk" are dropped by set type; "plst" by type too.
    expect(playSets(listing).map((s) => s.code)).toEqual([
      "fut",
      "mbc",
      "mdd",
      "dsk",
      "blb",
      "nod",
    ]);
  });

  it("excludes the official Commander sets from the Play picker", () => {
    const codes = playSets(listing).map((s) => s.code);
    for (const code of Object.keys(COMMANDER_SETS))
      expect(codes).not.toContain(code);
    expect(codes).not.toContain("cmm");
  });

  it("includes them in the Commander any-set picker", () => {
    expect(anySets(listing).map((s) => s.code)).toContain("cmm");
  });

  it("drops codes that are not three letters", () => {
    const long = set("plst", "The List", "expansion", "2026-01-01");
    expect(playSets([...listing, long]).map((s) => s.code)).not.toContain("plst");
  });
});

describe("released and upcoming", () => {
  it("splits on the date, treating a set with no date as unreleased", () => {
    const { upcoming, released } = groupByRelease(playSets(listing), TODAY);
    expect(upcoming.map((s) => s.code)).toEqual(["fut", "nod"]);
    expect(released.map((s) => s.code)).toEqual(["mbc", "mdd", "dsk", "blb"]);
  });

  it("counts a set released today as out", () => {
    const today = set("now", "Out Today", "expansion", TODAY);
    expect(groupByRelease([today], TODAY).released).toHaveLength(1);
  });

  it("marks an unreleased set in its label", () => {
    expect(setLabel(listing[4], TODAY)).toBe("Duskmourn (DSK)");
    expect(setLabel(listing[0], TODAY)).toBe("🔜 A Future Set (FUT) — out 2027-03-01");
    expect(setLabel(listing[1], TODAY)).toBe("🔜 No Date Announced (NOD)");
  });
});

describe("the default set", () => {
  /*
   * The case this rule exists for. Mystery Booster Commander Edition is the
   * newest released set here, but it is `masters` rather than a Limited set,
   * and in reality has 1 common and no mythics — opening the app on it would
   * show a pack it cannot build.
   */
  it("prefers a draftable set over a newer supplemental one", () => {
    expect(defaultSet(playSets(listing), TODAY)?.code).toBe("mdd");
  });

  it("falls back to the newest released set when none are draftable", () => {
    const sets = [
      set("mbc", "Mystery Booster Commander", "masters", "2026-10-24"),
      set("cmm", "Commander Masters", "masters", "2023-08-04"),
    ];
    expect(defaultSet(sets, TODAY)?.code).toBe("mbc");
  });

  it("never picks an unreleased set, however draftable", () => {
    const sets = [
      set("fut", "Future", "expansion", "2027-03-01"),
      set("old", "Old Masters", "masters", "2020-01-01"),
    ];
    expect(defaultSet(sets, TODAY)?.code).toBe("old");
  });

  it("returns null when nothing is out yet", () => {
    expect(defaultSet([set("fut", "Future", "expansion", "2027-03-01")], TODAY)).toBeNull();
    expect(defaultSet([], TODAY)).toBeNull();
  });
});
