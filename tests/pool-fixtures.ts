/*
 * The fake sets the pool loaders are run against.
 *
 * Duskmourn-shaped for Play and Commander-Legends-shaped for Commander, with
 * the awkward cases built in: two printings of one name, a common dual land,
 * a common land that is not a dual, a Special Guest from another set, the
 * Prismatic Piper, Backgrounds at three rarities, and an `is:booster` list
 * that omits one common.
 *
 * They live here rather than in the test because the golden file recorded
 * from the old app is keyed by these cases, and a recorder had to build the
 * same ones.
 */
import type { Card, ScryfallSet } from "@/lib/scryfall/types";

import { card, poolQuery } from "./fake-scryfall";

export const DSK_RELEASED = "2024-09-27";

/** A Duskmourn-shaped Play set, with the awkward cases built in. */
export function playFixture() {
  const commons = [
    card({ name: "Common One", rarity: "common" }),
    card({ name: "Common Two", rarity: "common" }),
    // Two printings of one name: grouping must collapse them.
    card({ name: "Common Two", rarity: "common", frame_effects: ["showcase"] }),
    // A common dual land, which belongs in the land slot only.
    card({
      name: "Dual Land",
      rarity: "common",
      type_line: "Land",
      produced_mana: ["W", "U"],
    }),
    // A common land that is NOT a dual: stays on the common sheet.
    card({ name: "Terramorphic", rarity: "common", type_line: "Land" }),
  ];
  const uncommons = [
    card({ name: "Uncommon One", rarity: "uncommon" }),
    card({ name: "Uncommon Two", rarity: "uncommon" }),
  ];
  const rares = [card({ name: "Rare One", rarity: "rare" })];
  const mythics = [card({ name: "Mythic One", rarity: "mythic" })];
  const nonBasicLands = [
    card({ name: "Dual Land", rarity: "common", type_line: "Land", produced_mana: ["W", "U"] }),
    card({ name: "Terramorphic", rarity: "common", type_line: "Land" }),
  ];
  const landSlot = [
    card({ name: "Plains", rarity: "common", type_line: "Basic Land — Plains" }),
    card({ name: "Island", rarity: "common", type_line: "Basic Land — Island" }),
    card({
      name: "Dual Land",
      rarity: "common",
      type_line: "Land",
      produced_mana: ["W", "U"],
    }),
  ];
  // `is:booster` omits "Common One", so it is filtered out of the commons.
  const booster = [
    ...commons.filter((c) => c.name !== "Common One"),
    ...uncommons,
    ...rares,
    ...mythics,
  ];
  const spgAll = [
    card({ name: "Guest Own", rarity: "rare", released_at: DSK_RELEASED }),
    card({ name: "Guest Other", rarity: "rare", released_at: "2023-01-01" }),
  ];
  return { commons, uncommons, rares, mythics, nonBasicLands, landSlot, booster, spgAll };
}

export interface PlayCaseOverrides {
  booster?: Card[];
  landSlot?: Card[];
  rares?: Card[];
  set?: ScryfallSet | null;
  spgAll?: Card[];
}

export function playRoutes(code: string, o: PlayCaseOverrides = {}) {
  const f = playFixture();
  const s = `s:${code} -is:promo`;
  const search: Record<string, Card[]> = {
    [poolQuery(`${s} r:common -t:basic`)]: f.commons,
    [poolQuery(`${s} r:uncommon -t:basic`)]: f.uncommons,
    [poolQuery(`${s} r:rare -t:basic`)]: o.rares ?? f.rares,
    [poolQuery(`${s} r:mythic -t:basic`)]: f.mythics,
    [poolQuery(`${s} t:land -t:basic`)]: f.nonBasicLands,
    [poolQuery(`${s} (t:basic or (r:common t:land -t:creature))`)]:
      o.landSlot ?? f.landSlot,
    [poolQuery(`${s} is:booster -t:basic`)]: o.booster ?? f.booster,
    [poolQuery(`set:spg`)]: o.spgAll ?? f.spgAll,
  };
  const sets: Record<string, ScryfallSet> = {};
  const set = o.set === undefined ? { code, name: code.toUpperCase(), released_at: DSK_RELEASED } : o.set;
  if (set) sets[code] = set;
  return { search, sets };
}

/** A Commander-Legends-shaped set: legends, Backgrounds, Piper, etched. */
export function commanderFixture() {
  const legend = (name: string, rarity: Card["rarity"]) =>
    card({ name, rarity, type_line: "Legendary Creature — Human Wizard" });
  const background = (name: string, rarity: Card["rarity"]) =>
    card({ name, rarity, type_line: "Legendary Enchantment — Background" });

  const commons = [
    card({ name: "Plain Common", rarity: "common" }),
    card({ name: "The Prismatic Piper", rarity: "common", type_line: "Legendary Creature — Shapeshifter" }),
    background("Common Background", "common"),
    legend("Common Legend", "common"),
  ];
  const uncommons = [
    card({ name: "Plain Uncommon", rarity: "uncommon" }),
    legend("Uncommon Legend", "uncommon"),
    background("Uncommon Background", "uncommon"),
  ];
  const rares = [
    card({ name: "Plain Rare", rarity: "rare" }),
    legend("Rare Legend", "rare"),
    background("Rare Background", "rare"),
  ];
  const mythics = [card({ name: "Plain Mythic", rarity: "mythic" }), legend("Mythic Legend", "mythic")];
  const piper = [
    card({ name: "The Prismatic Piper", rarity: "common", type_line: "Legendary Creature — Shapeshifter" }),
    card({ name: "Not The Piper", rarity: "common" }),
  ];
  const etched = [legend("Etched Legend", "mythic"), card({ name: "Etched Nonlegend", rarity: "rare" })];
  return { commons, uncommons, rares, mythics, piper, etched };
}

export function commanderRoutes(code: string, o: { booster?: Card[]; rares?: Card[] } = {}) {
  const f = commanderFixture();
  const s = `s:${code} -is:promo`;
  const all = [...f.commons, ...f.uncommons, ...f.rares, ...f.mythics];
  const search: Record<string, Card[]> = {
    [poolQuery(`${s} r:common -t:basic`)]: f.commons,
    [poolQuery(`${s} r:uncommon -t:basic`)]: f.uncommons,
    [poolQuery(`${s} r:rare -t:basic`)]: o.rares ?? f.rares,
    [poolQuery(`${s} r:mythic -t:basic`)]: f.mythics,
    [poolQuery(`${s} is:booster -t:basic`)]: o.booster ?? all,
    [poolQuery(`s:${code} !"The Prismatic Piper"`)]: f.piper,
    [poolQuery(`set:spg`)]: [card({ name: "Guest", rarity: "rare" })],
  };
  if (code === "cmr") search[poolQuery(`s:${code} is:etched`)] = f.etched;
  return { search, sets: { [code]: { code, name: code.toUpperCase(), released_at: "2020-11-20" } } };
}
