/*
 * Golden values.
 *
 * The published Duskmourn numbers, written out as the plan records them. Parity
 * proves the port agrees with the old code; this proves they are both still
 * right, and it is the test that would catch an odds change made on purpose in
 * one place and forgotten in another.
 *
 * DSK: 81 commons, 100 uncommons, 60 rares, 20 mythics.
 */
import { describe, expect, it } from "vitest";

import { expectedCounts, playSpec } from "@/lib/booster";
import type { Slot } from "@/lib/booster/types";
import { dsk } from "./fixtures";

/** "1-6  Common" plus "Common 100.0%", the way the plan writes it. */
function render(slots: Slot[]): string[] {
  return slots.map((s) => {
    const range = s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`;
    const outs = s.outcomes
      .map((o) => `${o.label} ${((o.p as number) * 100).toFixed(1)}%`)
      .join("  ");
    return `${range}  ${s.title}  ${outs}`;
  });
}

describe("Duskmourn vanilla", () => {
  const spec = playSpec({ vanilla: true, mult: 1, listEra: false }, dsk);

  it("matches the published slot table", () => {
    expect(render(spec)).toEqual([
      "1-6  Common  Common 100.0%",
      "7  Common or Special Guest  Common 98.4%  Special Guest 1.6%",
      "8-10  Uncommon  Uncommon 100.0%",
      "11  Rare or mythic  Rare 85.7%  Mythic 14.3%",
      "12  Land  Basic land 50.0%  Common dual land 50.0%",
      "13  Wildcard (non-foil)  Common 18.0%  Uncommon 67.0%  Rare 12.9%  Mythic 2.1%",
      "14  Wildcard (foil if rare or mythic)  Common 54.5%  Uncommon 33.7%  Rare 10.1%  Mythic 1.7%",
    ]);
  });

  it("expects 1.087 rares, 0.181 mythics and 0.318 foils per pack", () => {
    const exp = expectedCounts(spec);
    expect(exp.Rare).toBeCloseTo(1.087, 3);
    expect(exp.Mythic).toBeCloseTo(0.181, 3);
    expect(exp.__foil).toBeCloseTo(0.318, 3);
  });
});

describe("Duskmourn fun x1", () => {
  const spec = playSpec({ vanilla: false, mult: 1, listEra: false }, dsk);

  it("matches the published slot table", () => {
    expect(render(spec)).toEqual([
      "1-6  Common  Common 100.0%",
      "7  Uncommon or Special Guest  Uncommon 98.5%  Special Guest 1.5%",
      "8-9  Uncommon  Uncommon 100.0%",
      "10  Rare  Rare 100.0%",
      "11  Rare or mythic  Rare 85.7%  Mythic 14.3%",
      "12  Land (upgraded)  Non-basic land 100.0%",
      "13  Wildcard  Common 31.0%  Uncommon 38.3%  Rare 23.0%  Mythic 7.7%",
      "14  Wildcard (foil if rare or mythic)  Common 31.0%  Uncommon 38.3%  Rare 23.0%  Mythic 7.7%",
    ]);
  });

  it("expects 2.317 rares, 0.296 mythics and 0.307 foils per pack", () => {
    const exp = expectedCounts(spec);
    expect(exp.Rare).toBeCloseTo(2.317, 3);
    expect(exp.Mythic).toBeCloseTo(0.296, 3);
    expect(exp.__foil).toBeCloseTo(0.307, 3);
  });
});
