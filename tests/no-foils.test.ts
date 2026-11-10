/*
 * The no-foils option where it reaches the generator.
 *
 * The slot-level half of this — that no outcome comes out foil, and that
 * Commander Legends' foil-etched outcome is dropped and redistributed — is in
 * `invariants.test.ts`. This file covers the other half: the printings. Some
 * printings exist only as a foil, so the card drawn has to change, not just
 * its finish. That is a decision made per draw rather than per slot, and the
 * wiring runs through `generatePacks` and the two separator pickers.
 *
 * The fixtures copy the real shape that prompted this: Overgrown Tomb has
 * twenty printings and five are foil-only.
 */
import { describe, expect, it } from "vitest";

import { generatePacks, prepareBonus, prepareTokenSeparator } from "@/lib/generate";
import type { Card, NameMap, Slot } from "@/lib/booster/types";
import { LAND_CYCLES } from "@/lib/booster";

import { seededRng } from "./fixtures";

const printing = (name: string, n: string, finishes: string[]): Card =>
  ({ name, collector_number: n, finishes, type_line: "Land", id: `${name}-${n}` }) as Card;

/** Three names, each with an ordinary printing and a surge-foil one. */
const pool = (): NameMap =>
  new Map(
    ["Overgrown Tomb", "Steam Vents", "Godless Shrine"].map((name) => [
      name,
      [
        printing(name, "96", ["nonfoil", "foil"]),
        printing(name, "494", ["foil"]),
      ],
    ]),
  );

const slot = (n: number): Slot => ({
  n,
  title: "Common",
  outcomes: [{ pool: "commons", label: "Common", p: 1, foil: 0 }],
  from: 1,
  to: n,
});

async function run(noFoils: boolean) {
  const result = await generatePacks({
    setCode: "TEST",
    mode: "play",
    layoutTag: "",
    packCount: 6,
    opts: { vanilla: true, guest: false, tokenSheets: false, noFoils },
    pools: { commons: pool() },
    slots: [slot(6)],
    godSlots: null,
    rng: seededRng(3),
    bonusPick: null,
    separatorIsToken: false,
    fetchList: () => Promise.reject(new Error("not used")),
    log: () => {},
    onWarn: () => {},
  });
  return result.packs.flatMap((p) => p.cards.map((e) => e.card));
}

describe("printings that exist only as a foil", () => {
  it("are never drawn into a pack when foils are off", async () => {
    const cards = await run(true);
    expect(cards.length).toBe(36);
    for (const c of cards)
      expect(c.finishes, `${c.name} ${c.collector_number}`).toContain(
        "nonfoil",
      );
  });

  it("are drawn when foils are on, so the test above means something", async () => {
    const cards = await run(false);
    expect(
      cards.some((c) => !(c.finishes as string[]).includes("nonfoil")),
    ).toBe(true);
  });

  it("are never drawn as a separator land", async () => {
    const cycle = LAND_CYCLES.find((c) => c.id !== "random")!;
    const pick = await prepareBonus(cycle.id, {
      loadCycle: async () => pool(),
      rng: seededRng(11),
      noFoils: true,
    });
    for (let i = 0; i < 60; i++)
      expect((pick().card.finishes as string[])).toContain("nonfoil");
  });

  it("are never drawn as a separator token", async () => {
    const tokens = [
      printing("Soldier", "1", ["nonfoil", "foil"]),
      printing("Treasure", "2", ["nonfoil"]),
      printing("Surge Soldier", "25", ["foil"]),
    ];
    const pick = await prepareTokenSeparator("tfin", {
      loadTokens: async () => tokens as never,
      rng: seededRng(5),
      noFoils: true,
    });
    for (let i = 0; i < 60; i++) {
      const pair = pick();
      for (const c of [pair.card, pair.backCard])
        if (c) expect((c.finishes as string[])).toContain("nonfoil");
    }
  });
});
