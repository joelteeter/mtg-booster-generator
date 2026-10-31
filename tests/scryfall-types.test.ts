/*
 * The seam between the two type layers.
 *
 * `lib/booster` declares its own minimal `Card` — the handful of fields the
 * pure logic reads — so it never has to know about Scryfall. That only works
 * if a real Scryfall card is assignable to it. This asserts the assignment at
 * compile time and then actually runs the pure helpers over Scryfall-typed
 * cards, so a future field change cannot break the seam silently.
 */
import { describe, expect, it } from "vitest";

import {
  groupByName,
  isBoosterFun,
  isDoubleFacedToken,
  isLegendCreatureOrPW,
  sortTokens,
  typeLine,
} from "@/lib/booster";
import type { Card as BoosterCard } from "@/lib/booster/types";
import type { Card as ScryfallCard } from "@/lib/scryfall/types";

/** Fails to compile if a Scryfall card stops being assignable. */
type Extends<A, B> = A extends B ? true : false;
const scryfallCardIsABoosterCard: Extends<ScryfallCard, BoosterCard> = true;

describe("a Scryfall card is a booster-logic card", () => {
  it("is assignable at compile time", () => {
    expect(scryfallCardIsABoosterCard).toBe(true);
    const asBooster: BoosterCard = {
      id: "x",
      name: "Grizzly Bears",
    } satisfies ScryfallCard;
    expect(asBooster.name).toBe("Grizzly Bears");
  });

  it("works with the pure helpers unchanged", () => {
    const cards: ScryfallCard[] = [
      {
        id: "1",
        name: "Sivitri, Dragon Master",
        type_line: "Legendary Planeswalker — Sivitri",
        rarity: "mythic",
      },
      {
        id: "2",
        name: "Showcase Bear",
        type_line: "Creature — Bear",
        rarity: "common",
        frame_effects: ["showcase"],
      },
      {
        id: "3",
        name: "Day // Night",
        collector_number: "1",
        card_faces: [
          { type_line: "Token", image_uris: { normal: "a" } },
          { type_line: "Token", image_uris: { normal: "b" } },
        ],
      },
    ];

    expect(isLegendCreatureOrPW(cards[0])).toBe(true);
    expect(isBoosterFun(cards[1])).toBe(true);
    // Only presence of `image_uris` is checked, never a particular size.
    expect(isDoubleFacedToken(cards[2])).toBe(true);
    expect(typeLine(cards[2])).toBe("Token // Token");
    expect(groupByName(cards).size).toBe(3);
    expect(sortTokens(cards).map((c) => c.id)).toEqual(["3", "1", "2"]);
  });
});
