/*
 * The Lands and Tokens pages: what goes on the pages, and what the downloads
 * are called.
 *
 * The fixtures copy the shapes that made this worth building — a Secret Lair
 * drop whose lands are promos, a set that prints one artwork at two collector
 * numbers, a token set with a double-faced token in it.
 */
import { describe, expect, it } from "vitest";

import { matchSets } from "@/components/sheets/set-search";
import { runExport } from "@/lib/export";
import {
  buildSheets,
  fillToPage,
  filterLands,
  foilOnlyCount,
  sheetCards,
  sheetFilenames,
  seedFrom,
  sheetQuery,
  tokenSetFor,
} from "@/lib/sheets";
import type { Card, ScryfallSet } from "@/lib/scryfall/types";

import { DEFAULT_SETTINGS } from "./export-fixtures";

const card = (
  name: string,
  n: number,
  extra: Partial<Card> = {},
): Card =>
  ({
    id: `${name}-${n}`,
    name,
    collector_number: String(n),
    illustration_id: `art-${name}-${n}`,
    type_line: "Land",
    ...extra,
  }) as Card;

const set = (code: string, name: string, type = "expansion"): ScryfallSet =>
  ({ code, name, set_type: type, released_at: "2024-01-01" }) as ScryfallSet;

describe("the search a page runs", () => {
  it("asks for a set's lands, or for everything in a token set", () => {
    expect(sheetQuery("lands", "sld")).toBe("set:sld t:land");
    expect(sheetQuery("tokens", "tdsk")).toBe("set:tdsk");
  });

  /*
   * Promos are not excluded, unlike the booster pools. A booster pool asks
   * what could come out of a pack, where a promo could not; this asks what a
   * set printed, where it did — and a Secret Lair drop is nothing else.
   */
  it("does not exclude promos the way the booster pools do", () => {
    expect(sheetQuery("lands", "sld")).not.toContain("is:promo");
  });
});

describe("finding a set's tokens", () => {
  it("prefixes an ordinary set's code", () => {
    expect(tokenSetFor(set("dsk", "Duskmourn"))).toBe("tdsk");
  });

  /*
   * By type, never by the spelling of the code: `thb` is Theros Beyond Death,
   * not the tokens of a set called `hb`.
   */
  it("takes a token set as it is, and is not fooled by a leading t", () => {
    expect(tokenSetFor(set("tdsk", "Duskmourn Tokens", "token"))).toBe("tdsk");
    expect(tokenSetFor(set("thb", "Theros Beyond Death"))).toBe("tthb");
  });
});

describe("what lands up on the pages", () => {
  it("keeps one printing per artwork, in collector order", () => {
    const cards = [
      card("Island", 30),
      card("Plains", 10),
      // The same artwork at a second collector number.
      card("Plains", 20, { illustration_id: "art-Plains-10" }),
    ];
    expect(sheetCards(cards).map((c) => c.collector_number)).toEqual([
      "10",
      "30",
    ]);
  });

  it("fills pages nine at a time, leaving the last one short", () => {
    const cards = Array.from({ length: 20 }, (_, i) => card("Land", i));
    const sheets = buildSheets(cards, "lands", false);
    expect(sheets.map((s) => s.length)).toEqual([9, 9, 2]);
  });

  it("prints lands single-sided, so each gets a card back", () => {
    const sheets = buildSheets([card("Plains", 1)], "lands", false);
    expect(sheets[0][0].backCard).toBeUndefined();
    expect(sheets[0][0].tokenSlot).toBeUndefined();
    expect(sheets[0][0].finish).toBe("nonfoil");
  });
});

/*
 * The same rule the booster sheets follow: a printing that only exists as a
 * foil is a separate treatment with its own frame, not an ordinary card with
 * a finish, so it cannot be printed flat and is never offered.
 */
describe("printings that exist only as a foil", () => {
  it("are left out, and counted so the page can say so", () => {
    const cards = [
      card("Plains", 1, { finishes: ["nonfoil", "foil"] }),
      card("Island", 2, { finishes: ["foil"] }),
      card("Swamp", 3, { finishes: ["nonfoil"] }),
    ];
    expect(sheetCards(cards).map((c) => c.name)).toEqual(["Plains", "Swamp"]);
    expect(foilOnlyCount(cards)).toBe(1);
  });

  /*
   * Dropped before the artwork is deduplicated. A set often prints one art
   * both ways; deduplicating first could keep the foil-only printing and
   * throw away the ordinary one, losing a card the set does have.
   */
  it("never cost a card that also exists in non-foil", () => {
    const art = "shared-art";
    const cards = [
      card("Forest", 1, { finishes: ["foil"], illustration_id: art }),
      card("Forest", 2, { finishes: ["nonfoil"], illustration_id: art }),
    ];
    const kept = sheetCards(cards);
    expect(kept).toHaveLength(1);
    expect(kept[0].collector_number).toBe("2");
  });
});

describe("how much of a set's lands to print", () => {
  const cards = [
    card("Plains", 1, { type_line: "Basic Land — Plains" }),
    card("Plains", 2, { type_line: "Basic Land — Plains", full_art: true }),
    card("Island", 3, { type_line: "Basic Land — Island", full_art: true }),
    card("Hallowed Fountain", 4, { type_line: "Land — Plains Island" }),
  ];

  it("prints everything by default", () => {
    expect(filterLands(cards, "all")).toHaveLength(4);
  });

  it("drops the nonbasics when asked for basics", () => {
    expect(filterLands(cards, "basics").map((c) => c.name)).toEqual([
      "Plains",
      "Plains",
      "Island",
    ]);
  });

  /*
   * Nested, not independent: a set's full-art lands are its basics in another
   * treatment, so this is a narrowing of "basics" rather than a second axis.
   */
  it("narrows again to the full-art ones", () => {
    const full = filterLands(cards, "fullArtBasics");
    expect(full.map((c) => c.collector_number)).toEqual(["2", "3"]);
    const basics = filterLands(cards, "basics");
    expect(full.every((c) => basics.includes(c))).toBe(true);
  });

  it("leaves tokens alone, which have no such filter", () => {
    expect(filterLands(cards, "all")).toEqual(cards);
  });
});

describe("tokens two to a card", () => {
  const tokens = Array.from({ length: 5 }, (_, i) => card("Token", i));

  it("halves the paper when asked, and does not when not", () => {
    expect(buildSheets(tokens, "tokens", true).flat()).toHaveLength(3);
    expect(buildSheets(tokens, "tokens", false).flat()).toHaveLength(5);
  });

  it("pairs them front to back", () => {
    const [sheet] = buildSheets(tokens, "tokens", true);
    expect(sheet[0].card.name).toBe("Token");
    expect(sheet[0].backCard?.collector_number).toBe("1");
    expect(sheet[0].tokenSlot).toBe(true);
  });

  /*
   * An odd one out keeps a blank back rather than repeating a token: these
   * pages are a reference, and a second copy of one token at the cost of a
   * different one is a poor trade.
   */
  it("leaves the odd one's back blank rather than repeating a token", () => {
    const [sheet] = buildSheets(tokens, "tokens", true);
    expect(sheet[sheet.length - 1].backCard).toBeNull();
  });

  /*
   * A token that is already double-faced brings its own back, so it is never
   * paired with another. It carries no `backCard`; `tokenSlot` is what tells
   * the exporter to print the card's own second face there.
   */
  it("gives a double-faced token a card to itself", () => {
    const dfc = card("Punchcard", 9, {
      card_faces: [{ image_uris: {} }, { image_uris: {} }],
    } as Partial<Card>);
    const [sheet] = buildSheets([dfc, ...tokens], "tokens", true);
    const own = sheet.find((e) => e.card.name === "Punchcard");
    expect(own?.backCard).toBeFalsy();
    expect(own?.tokenSlot).toBe(true);
    // Paired tokens get a real card on the back; this one does not.
    const paired = sheet.filter((e) => e.backCard);
    expect(paired.every((e) => e.card.name !== "Punchcard")).toBe(true);
  });
});

/*
 * Filling the last page.
 *
 * Off by default: the pages are a reference first, and a second copy of a
 * card is only worth having if the paper was going to be used anyway.
 */
describe("filling the last page out to nine", () => {
  const cards = Array.from({ length: 10 }, (_, i) => card("Land", i));

  it("leaves a full page alone", () => {
    const nine = cards.slice(0, 9);
    expect(fillToPage(nine, 9, "seed")).toEqual(nine);
    expect(fillToPage([], 9, "seed")).toEqual([]);
  });

  it("tops a short page up from the same cards", () => {
    const filled = fillToPage(cards, 9, "seed");
    expect(filled).toHaveLength(18);
    for (const c of filled) expect(cards).toContain(c);
  });

  /*
   * The whole reason it is seeded. With `Math.random` the preview would
   * reshuffle on any re-render, and the PDF you downloaded would hold
   * different cards from the ones you had just looked at.
   */
  it("gives the same page every time for the same selection", () => {
    const once = fillToPage(cards, 9, "dsk:lands:all").map((c) => c.id);
    const again = fillToPage(cards, 9, "dsk:lands:all").map((c) => c.id);
    expect(again).toEqual(once);
  });

  it("gives a different one for a different selection", () => {
    const a = fillToPage(cards, 9, "dsk:lands:all").map((c) => c.id);
    const b = fillToPage(cards, 9, "dsk:lands:basics").map((c) => c.id);
    expect(b).not.toEqual(a);
  });

  it("seeds reproducibly and spreads over the range", () => {
    const draws = Array.from({ length: 200 }, seedFrom("dsk"));
    // Same seed, same sequence — that is the point of it.
    expect(Array.from({ length: 200 }, seedFrom("dsk"))).toEqual(draws);
    expect(Array.from({ length: 200 }, seedFrom("trk"))).not.toEqual(draws);
    for (const d of draws) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(1);
    }
    expect(new Set(draws).size).toBeGreaterThan(150);
  });

  it("numbers the slots on each page from one, filler included", () => {
    const sheets = buildSheets(cards, "lands", false, 9, { seed: "x" });
    expect(sheets).toHaveLength(2);
    expect(sheets.map((s) => s.length)).toEqual([9, 9]);
    for (const sheet of sheets)
      expect(sheet.map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  /*
   * Padded after the tokens are paired, not before: the unit being filled is
   * the slot on the paper, so a filled token page is nine cards rather than
   * nine tokens.
   */
  it("fills token pages by the card, not by the token", () => {
    const tokens = Array.from({ length: 5 }, (_, i) => card("Token", i));
    const [sheet] = buildSheets(tokens, "tokens", true, 9, { seed: "x" });
    expect(sheet).toHaveLength(9);
  });
});

describe("what the downloads are called", () => {
  it("names the set, the kind and the page", () => {
    expect(sheetFilenames("tdsk", "tokens", 2)).toEqual([
      "TDSK-AllTokens-2",
      "TDSK-Tokens-1",
      "TDSK-Tokens-2",
    ]);
    expect(sheetFilenames("sld", "lands", 1)).toEqual([
      "SLD-AllLands-1",
      "SLD-Lands-1",
    ]);
  });

  /*
   * The pages hand their sheets to the same exporter the booster page uses,
   * so a page of lands and a pack go through one path. Row 0 is everything.
   */
  it("exports a page, or all of them, through the booster's own exporter", async () => {
    const cards = Array.from({ length: 10 }, (_, i) => card("Plains", i));
    const sheets = buildSheets(cards, "lands", false);
    const base = sheetFilenames("sld", "lands", sheets.length);
    const saved: string[] = [];
    const seen: number[] = [];
    for (const idx of [0, 1, 2]) {
      await runExport({
        kind: "pdf",
        idx,
        packs: sheets,
        base,
        settings: DEFAULT_SETTINGS,
        onStatus: () => {},
        save: (_b, name) => saved.push(name),
        exporter: {
          buildPdf: async (packs) => {
            seen.push(packs.flat().length);
            return new Uint8Array([1]);
          },
          buildSaveFile: async () => new Uint8Array(),
        },
      });
    }
    expect(saved).toEqual([
      "SLD-AllLands-2.pdf",
      "SLD-Lands-1.pdf",
      "SLD-Lands-2.pdf",
    ]);
    // All ten cards for row 0; then nine and one.
    expect(seen).toEqual([10, 9, 1]);
  });
});

describe("searching the set list", () => {
  const sets = [
    set("sld", "Secret Lair Drop", "box"),
    set("slp", "Secret Lair Promo"),
    set("dsk", "Duskmourn: House of Horror"),
  ];

  it("matches on name or code", () => {
    expect(matchSets(sets, "duskmourn").map((s) => s.code)).toEqual(["dsk"]);
    expect(matchSets(sets, "secret").map((s) => s.code)).toEqual(["sld", "slp"]);
  });

  /*
   * An exact code first: typing "sld" means the Secret Lair Drop, not every
   * set with those letters somewhere in its name.
   */
  it("puts an exact code match at the front", () => {
    expect(matchSets(sets, "sld")[0].code).toBe("sld");
  });

  it("shows the newest few when nothing is typed", () => {
    expect(matchSets(sets, "", 2)).toHaveLength(2);
  });
});
