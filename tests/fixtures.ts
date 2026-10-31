/*
 * Inputs for the parity sweep.
 *
 * Pool sizes are all either real or deliberately awkward. The awkward ones
 * matter more: empty pools, missing fallbacks and lopsided rare/mythic sheets
 * are where the two implementations could disagree, and where the odds bugs
 * fixed in October actually lived.
 */
import type { Card, Stats } from "@/lib/booster/types";

/**
 * Duskmourn, the set the plan's golden values come from: 81 commons,
 * 100 uncommons, 60 rares, 20 mythics.
 */
export const dsk: Stats = {
  commons: 81,
  uncommons: 100,
  rares: 60,
  mythics: 20,
  spg: 60,
  landBasics: 5,
  landDuals: 10,
  nonBasicLands: 12,
};

/**
 * Marvel: Darkhold Destiny — 1 rare and 3 mythics, so the mythic share is
 * 3 ÷ (2×1 + 3) = 60%. This is the set that exposed the old hardcoded 13%.
 */
export const lopsided: Stats = {
  commons: 10,
  uncommons: 8,
  rares: 1,
  mythics: 3,
  spg: 2,
  landBasics: 5,
  landDuals: 0,
  nonBasicLands: 1,
};

/** No mythics at all: the mythic share must come out 0, not a constant. */
export const noMythics: Stats = {
  commons: 40,
  uncommons: 30,
  rares: 15,
  mythics: 0,
  spg: 3,
  landBasics: 5,
  landDuals: 4,
  nonBasicLands: 6,
};

/** Mythics but no rares: the share must come out 1. */
export const noRares: Stats = {
  commons: 40,
  uncommons: 30,
  rares: 0,
  mythics: 9,
  spg: 3,
  landBasics: 5,
  landDuals: 4,
  nonBasicLands: 6,
};

/**
 * A set missing the optional pools: no common duals, no non-basic lands, no
 * Special Guests. Exercises the fallback chains and the dropping and
 * renormalising that `finalize` does.
 */
export const sparse: Stats = {
  commons: 20,
  uncommons: 15,
  rares: 8,
  mythics: 2,
  spg: 0,
  landBasics: 0,
  landDuals: 0,
  nonBasicLands: 0,
};

/** Every pool empty: every outcome is dropped and nothing is renormalised. */
export const empty: Stats = {
  commons: 0,
  uncommons: 0,
  rares: 0,
  mythics: 0,
  spg: 0,
  landBasics: 0,
  landDuals: 0,
  nonBasicLands: 0,
};

/** A full Commander set: legends at every rarity, Backgrounds, Piper, etched. */
export const commanderFull: Stats = {
  commons: 101,
  uncommons: 60,
  rares: 40,
  mythics: 12,
  legC: 2,
  legU: 30,
  legR: 25,
  legM: 8,
  legAll: 65,
  bgCU: 10,
  bgR: 5,
  piper: 1,
  etched: 20,
  allC: 103,
  allU: 100,
  allR: 70,
  allM: 20,
};

/**
 * A commander-style booster built from an ordinary set: no Backgrounds, no
 * Prismatic Piper, no etched legends, and no uncommon legends either, so the
 * legendary slots have to fall back down their chains.
 */
export const commanderBorrowed: Stats = {
  commons: 81,
  uncommons: 100,
  rares: 60,
  mythics: 20,
  legC: 0,
  legU: 0,
  legR: 6,
  legM: 3,
  legAll: 9,
  bgCU: 0,
  bgR: 0,
  piper: 0,
  etched: 0,
  allC: 81,
  allU: 100,
  allR: 60,
  allM: 20,
};

/** Named so failures say which fixture broke. `null` is the loading case. */
export const statsCases: ReadonlyArray<readonly [string, Stats | null]> = [
  ["dsk", dsk],
  ["lopsided", lopsided],
  ["noMythics", noMythics],
  ["noRares", noRares],
  ["sparse", sparse],
  ["empty", empty],
  ["commanderFull", commanderFull],
  ["commanderBorrowed", commanderBorrowed],
  ["null (still loading)", null],
];

/** A deterministic, well-distributed PRNG, so sampling parity is comparable. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const img = { normal: "https://example.invalid/x.jpg" };

/**
 * Tokens shaped like a real token set: two different Spirits and two different
 * Insects sharing a name, a double-faced token that brings its own back, and a
 * non-numeric collector number to sort.
 */
export const tokenFixture: Card[] = [
  { name: "Spirit", collector_number: "6", type_line: "Token Creature — Spirit", image_uris: img },
  { name: "Spirit", collector_number: "8", type_line: "Token Creature — Spirit", image_uris: img },
  { name: "Insect", collector_number: "5", type_line: "Token Creature — Insect", image_uris: img },
  { name: "Insect", collector_number: "13", type_line: "Token Creature — Insect", image_uris: img },
  { name: "Glistener Elf", collector_number: "2", type_line: "Token Creature", image_uris: img },
  { name: "Treasure", collector_number: "11", type_line: "Token Artifact — Treasure", image_uris: img },
  { name: "Wicked Role", collector_number: "9", type_line: "Token Enchantment — Aura Role", image_uris: img },
  // An emblem: `is:token` excludes these, but they are on the physical sheet.
  { name: "Emblem Chandra", collector_number: "19", type_line: "Emblem — Chandra", image_uris: img },
  // Already double-faced: fills a slot alone, with no partner on the back.
  {
    name: "Day // Night",
    collector_number: "1",
    card_faces: [
      { type_line: "Token", image_uris: img },
      { type_line: "Token", image_uris: img },
    ],
  },
  { name: "Clue", collector_number: "T4", type_line: "Token Artifact — Clue", image_uris: img },
];

/** Cards for the classification and grouping helpers. */
export const cardFixture: Card[] = [
  { name: "Grizzly Bears", type_line: "Creature — Bear" },
  { name: "Sivitri, Dragon Master", type_line: "Legendary Planeswalker — Sivitri" },
  { name: "Faceless One", type_line: "Legendary Creature — Shapeshifter" },
  { name: "Guild Artisan", type_line: "Legendary Enchantment — Background" },
  { name: "The Prismatic Piper", type_line: "Legendary Creature — Shapeshifter" },
  // Reversible printing: "X // X" groups with the plain "X".
  { name: "Grizzly Bears // Grizzly Bears", type_line: "Creature — Bear" },
  // Modal double-faced: types live on the faces.
  {
    name: "Hengegate Pathway // Mistgate Pathway",
    card_faces: [{ type_line: "Land" }, { type_line: "Land" }],
  },
  { name: "Showcase Bear", type_line: "Creature — Bear", frame_effects: ["showcase"] },
  { name: "Borderless Bear", type_line: "Creature — Bear", border_color: "borderless" },
  { name: "Extended Bear", type_line: "Creature — Bear", frame_effects: ["extendedart"] },
  { name: "Inverted Bear", type_line: "Creature — Bear", frame_effects: ["inverted"] },
  { name: "Full Art Bear", type_line: "Creature — Bear", full_art: true },
  { name: "Plain Bear", type_line: "Creature — Bear", frame_effects: [] },
];
