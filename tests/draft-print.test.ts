/*
 * Everybody's decks, as pages.
 *
 * The test that matters most is the round trip: a decklist this writes is
 * read back by the Proxies page's own parser and comes out with the same
 * cards in the same numbers. That is the claim the whole printing step rests
 * on — the admin can paste it into `/proxies` and change something — and it
 * is only true if the two agree on the format down to the brackets.
 */
import { describe, expect, it } from "vitest";

import { expandFaces, layoutPages } from "@/lib/export/layout";
import {
  deckCards,
  decklistText,
  printFilenames,
  printIdentifiers,
  printRows,
  type Found,
} from "@/lib/draft-print";
import { parseProxyList } from "@/lib/proxies";
import type { DeckSheet } from "@/lib/room";
import type { Card } from "@/lib/scryfall/types";

const card = (id: string, name: string, number: string, set = "neo"): Card =>
  ({
    id,
    name,
    set,
    collector_number: number,
    image_uris: { normal: `https://img.test/${id}.jpg` },
  }) as Card;

const ref = (id: string) => ({ key: `k-${id}`, id, finish: "nonfoil" });

const sheet = (over: Partial<DeckSheet> = {}): DeckSheet => ({
  playerId: "p1",
  name: "Ada",
  seat: 0,
  submitted: true,
  main: [],
  side: [],
  basics: {},
  ...over,
});

const ADA = sheet({
  main: [ref("a1"), ref("a2"), ref("a1")],
  side: [ref("s1")],
  basics: { Forest: 9, Island: 8 },
});

const BRAM = sheet({
  playerId: "p2",
  name: "Bram Stoker-Jones",
  seat: 1,
  main: [ref("b1")],
});

const FOUND: Found = new Map([
  ["a1", card("a1", "Kami of Transience", "12")],
  ["a2", card("a2", "Okiba Reckoner Raid", "107")],
  ["b1", card("b1", "Tamiyo's Safekeeping", "208")],
  ["s1", card("s1", "Ambitious Assault", "88")],
  ["Forest", card("f", "Forest", "293")],
  ["Island", card("i", "Island", "295")],
]);

const WITH = { include: true };
const WITHOUT = { include: false };

describe("what to look up", () => {
  it("asks for drafted cards by id, each one once", () => {
    const ids = printIdentifiers([ADA, BRAM], WITHOUT);
    /* A player at a time, deck then sideboard — so Ada's s1 precedes Bram. */
    expect(ids).toEqual([
      { id: "a1" },
      { id: "a2" },
      { id: "s1" },
      { id: "b1" },
    ]);
    /*
     * By id because the draft has handled nothing else since the pool was
     * uploaded, so a printing cannot come out as the wrong art — which is
     * the failure the Proxies page has a whole fallback chain for.
     */
  });

  it("adds basics by name, and only when they are being printed", () => {
    expect(printIdentifiers([ADA], WITHOUT)).not.toContainEqual({
      name: "Forest",
    });
    expect(printIdentifiers([ADA], WITH)).toEqual(
      expect.arrayContaining([{ name: "Forest" }, { name: "Island" }]),
    );
    expect(printIdentifiers([ADA], { include: true, set: "neo" })).toEqual(
      expect.arrayContaining([{ name: "Forest", set: "neo" }]),
    );
  });

  it("asks for a basic once however many people play it", () => {
    const two = [ADA, sheet({ playerId: "p3", seat: 2, basics: { Forest: 4 } })];
    const forests = printIdentifiers(two, WITH).filter(
      (i) => "name" in i && i.name === "Forest",
    );
    expect(forests).toHaveLength(1);
  });
});

describe("one player's cards", () => {
  it("puts the deck first, then its lands, then the sideboard", () => {
    const cards = deckCards(ADA, FOUND, WITH);
    /*
     * Lands in the order a decklist writes them — WUBRG — rather than the
     * order somebody happened to touch the steppers in.
     */
    expect(cards.map((c) => c.name)).toEqual([
      "Kami of Transience",
      "Okiba Reckoner Raid",
      "Kami of Transience",
      ...Array(8).fill("Island"),
      ...Array(9).fill("Forest"),
      "Ambitious Assault",
    ]);
  });

  it("leaves the lands out when they are not being printed", () => {
    const cards = deckCards(ADA, FOUND, WITHOUT);
    expect(cards).toHaveLength(4);
    expect(cards.some((c) => c.name === "Forest")).toBe(false);
    /*
     * Which is the saving: twenty-three and five printed instead of
     * forty-five, and most people own a pile of basics already.
     */
  });

  it("skips a card that could not be looked up rather than failing", () => {
    const holed: Found = new Map(FOUND);
    holed.delete("a2");
    expect(deckCards(ADA, holed, WITHOUT).map((c) => c.id)).toEqual([
      "a1",
      "a1",
      "s1",
    ]);
  });
});

describe("the decklist", () => {
  it("gathers identical printings into one line", () => {
    expect(decklistText(ADA, FOUND, WITHOUT)).toBe(
      [
        "2 Kami of Transience (NEO) 12",
        "1 Okiba Reckoner Raid (NEO) 107",
        "",
        "Sideboard",
        "1 Ambitious Assault (NEO) 88",
      ].join("\n"),
    );
  });

  it("writes the basics into the deck, not the sideboard", () => {
    const text = decklistText(ADA, FOUND, WITH);
    const [deck, side] = text.split("\nSideboard\n");
    expect(deck).toContain("9 Forest (NEO) 293");
    expect(deck).toContain("8 Island (NEO) 295");
    expect(side).not.toContain("Forest");
  });

  it("leaves the heading out when there is no sideboard", () => {
    expect(decklistText(BRAM, FOUND, WITHOUT)).toBe(
      "1 Tamiyo's Safekeeping (NEO) 208",
    );
  });

  it("is read back by the Proxies parser as the same cards", () => {
    /*
     * The round trip is the whole claim: the admin can paste this into
     * `/proxies`, change a line, and print from there instead.
     */
    const text = decklistText(ADA, FOUND, WITH);
    const parsed = parseProxyList(text);
    expect(parsed.lines.map((l) => [l.qty, l.name, l.set, l.number])).toEqual([
      [2, "Kami of Transience", "NEO", "12"],
      [1, "Okiba Reckoner Raid", "NEO", "107"],
      [8, "Island", "NEO", "295"],
      [9, "Forest", "NEO", "293"],
      [1, "Ambitious Assault", "NEO", "88"],
    ]);
    /* Every card accounted for, and the heading taken as a heading. */
    expect(parsed.lines.reduce((n, l) => n + l.qty, 0)).toBe(
      deckCards(ADA, FOUND, WITH).length,
    );
  });
});

describe("pages and filenames", () => {
  it("gives each player a row, which is what breaks the page between them", () => {
    const rows = printRows([ADA, BRAM], FOUND, WITHOUT, "frontOnly");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(4);
    expect(rows[1]).toHaveLength(1);
    /* Slots are numbered within a player, since a player is a row. */
    expect(rows[0].map((e) => e.slot)).toEqual([1, 2, 3, 4]);
  });

  it("splits a double-faced card into two slots when asked to", () => {
    const dfc = {
      id: "d1",
      name: "Fable // Reflection",
      set: "mid",
      collector_number: "1",
      card_faces: [
        { name: "Fable", image_uris: { normal: "f.jpg" } },
        { name: "Reflection", image_uris: { normal: "r.jpg" } },
      ],
    } as unknown as Card;
    const found: Found = new Map([["d1", dfc]]);
    const one = sheet({ main: [ref("d1")] });

    expect(printRows([one], found, WITHOUT, "separate")[0]).toHaveLength(2);
    expect(printRows([one], found, WITHOUT, "frontOnly")[0]).toHaveLength(1);

    /*
     * And once split, the exporter must not split it again — the same
     * guarantee the Proxies page needs, for the same reason: the page you
     * chose has to be the page you saw.
     */
    const rows = printRows([one], found, WITHOUT, "separate");
    expect(expandFaces(rows, "separate")[0]).toHaveLength(rows[0].length);
  });

  it("starts each player on a fresh sheet", () => {
    /*
     * The claim the printing rests on, checked against the exporter's own
     * pagination rather than by reading a PDF: two decks of twenty-five come
     * out as three pages each — nine, nine, seven — and never as five and a
     * half pages with two people's cards sharing the sixth. The admin would
     * have to cut that one apart by hand.
     */
    const twentyFive = (id: string) =>
      sheet({
        playerId: id,
        name: id,
        seat: id === "a" ? 0 : 1,
        main: Array.from({ length: 25 }, (_, i) => ref(`${id}${i}`)),
      });
    const found: Found = new Map(
      ["a", "b"].flatMap((p) =>
        Array.from({ length: 25 }, (_, i) =>
          [`${p}${i}`, card(`${p}${i}`, `Card ${p}${i}`, String(i))] as const,
        ),
      ),
    );
    const rows = printRows([twentyFive("a"), twentyFive("b")], found, WITHOUT, "frontOnly");

    const apart = layoutPages(rows, true);
    expect(apart.map((p) => p.length)).toEqual([9, 9, 7, 9, 9, 7]);

    /* Without the break they would run together, which is what is forced. */
    expect(layoutPages(rows, false).map((p) => p.length)).toEqual([
      9, 9, 9, 9, 9, 5,
    ]);
  });

  it("names the files by seat so two people cannot collide", () => {
    expect(printFilenames("K7MQ2F", [ADA, BRAM])).toEqual([
      "Draft-K7MQ2F-All-2",
      "Draft-K7MQ2F-1-Ada",
      "Draft-K7MQ2F-2-Bram-Stoker-Jones",
    ]);
  });

  it("copes with a name that is no use as a filename", () => {
    expect(
      printFilenames("K7MQ2F", [sheet({ name: "🙂", seat: 4 })]),
    ).toEqual(["Draft-K7MQ2F-All-1", "Draft-K7MQ2F-5-player"]);
  });
});
