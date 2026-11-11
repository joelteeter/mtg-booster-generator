/*
 * A whole fake set, for the generate parity sweep.
 *
 * Big enough that every slot has somewhere to draw from, and awkward in the
 * places that matter: cards with several printings (so the printing draw is
 * exercised), alternate treatments (so Booster Fun slots have something to
 * prefer), common dual lands (which come out of the common sheet), Special
 * Guests sharing the set's release date (so the Guest List swap fires), and a
 * token set with one token that is already double-faced.
 *
 * Both implementations are handed the same `fetch`, so they load literally the
 * same card objects and any difference afterwards is theirs.
 */
import { landCycleQuery, tokenSetCode } from "@/lib/booster";
import type { Card, ScryfallSet } from "@/lib/scryfall/types";
import type { SetSelection, TabOptions } from "@/store/options";

import { card, poolQuery } from "./fake-scryfall";

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const SET = "dsk";
export const RELEASED = "2024-08-02";

export const dskSet: ScryfallSet = {
  code: SET,
  name: "Duskmourn: House of Horror",
  set_type: "expansion",
  released_at: RELEASED,
  card_count: 276,
};

/*
 * The fields the CSV row reads, so most of a row is not empty string. The
 * comma in the artist name is deliberate: the CSV quotes that column, and a
 * row that stops quoting it would shift every column after it.
 */
const csvFields: Partial<Card> = {
  set_name: "Duskmourn: House of Horror",
  artist: "Nightmare Artist, the Elder",
  lang: "en",
  prices: { usd: "1.23", eur: "0.99", tix: "0.04" },
  scryfall_uri: "https://scryfall.com/card/dsk/1",
  mana_cost: "{2}{B}",
};

/** A card plus an alternate treatment of it, so the printing draw matters. */
const withShowcase = (base: Partial<Card>): Card[] => [
  card({ ...csvFields, ...base, collector_number: `${base.collector_number}` }),
  card({
    ...csvFields,
    ...base,
    collector_number: `${base.collector_number}s`,
    frame_effects: ["showcase"],
  }),
];

const commons: Card[] = range(14).flatMap((i) =>
  i % 5 === 0
    ? withShowcase({
        name: `Grim Common ${i}`,
        rarity: "common",
        set: SET,
        collector_number: `${10 + i}`,
      })
    : [
        card({
          ...csvFields,
          name: `Grim Common ${i}`,
          rarity: "common",
          set: SET,
          collector_number: `${10 + i}`,
        }),
      ],
);

const uncommons: Card[] = range(10).map((i) =>
  card({
    ...csvFields,
    name: `Haunted Uncommon ${i}`,
    rarity: "uncommon",
    set: SET,
    collector_number: `${100 + i}`,
  }),
);

const rares: Card[] = range(8).flatMap((i) =>
  i % 3 === 0
    ? withShowcase({
        name: `Dread Rare ${i}`,
        rarity: "rare",
        set: SET,
        collector_number: `${200 + i}`,
      })
    : [
        card({
          ...csvFields,
          name: `Dread Rare ${i}`,
          rarity: "rare",
          set: SET,
          collector_number: `${200 + i}`,
        }),
      ],
);

const mythics: Card[] = range(4).map((i) =>
  card({
    ...csvFields,
    name: `Nightmare Mythic ${i}`,
    rarity: "mythic",
    set: SET,
    collector_number: `${300 + i}`,
    border_color: i === 0 ? "borderless" : "black",
  }),
);

/** A modal double-faced rare: two faces, each with its own image. */
const dfcRare: Card = {
  id: "dfc-rare",
  name: "Split Horror // Split Terror",
  rarity: "rare",
  set: SET,
  collector_number: "250",
  card_faces: [
    {
      name: "Split Horror",
      type_line: "Creature — Horror",
      mana_cost: "{2}{B}",
      image_uris: { normal: "https://img/front.jpg", small: "https://img/fs.jpg" },
    },
    {
      name: "Split Terror",
      type_line: "Creature — Terror",
      mana_cost: "{B}",
      image_uris: { normal: "https://img/back.jpg", small: "https://img/bs.jpg" },
    },
  ],
};

const basics: Card[] = ["Plains", "Island", "Swamp", "Mountain", "Forest"].map(
  (name, i) =>
    card({
      ...csvFields,
      name,
      rarity: "common",
      mana_cost: "",
      type_line: "Basic Land — " + name,
      set: SET,
      collector_number: `${270 + i}`,
    }),
);

/** Common duals: two colours of real mana, so they leave the common sheet. */
const duals: Card[] = range(4).map((i) =>
  card({
    ...csvFields,
    mana_cost: "",
    name: `Duskmourn Dual ${i}`,
    rarity: "common",
    type_line: "Land",
    produced_mana: ["W", "U"],
    set: SET,
    collector_number: `${260 + i}`,
  }),
);

const otherLands: Card[] = range(3).map((i) =>
  card({
    ...csvFields,
    mana_cost: "",
    name: `Creeping Land ${i}`,
    rarity: "uncommon",
    type_line: "Land",
    produced_mana: ["B"],
    set: SET,
    collector_number: `${255 + i}`,
  }),
);

/*
 * Special Guests. Most of them share a name with one of this set's commons,
 * which is what the Guest List swap looks for, so the 50% roll is taken many
 * times in a run; the rest do not, so the swap also has to miss.
 */
const spg: Card[] = [
  ...range(8).map((i) =>
    card({
      ...csvFields,
      name: `Grim Common ${i}`,
      rarity: "special",
      set: "spg",
      collector_number: `${i + 1}`,
      released_at: RELEASED,
    }),
  ),
  card({
    ...csvFields,
    name: "Dread Rare 1",
    rarity: "special",
    set: "spg",
    collector_number: "20",
    released_at: RELEASED,
  }),
  // Not this set's: a different release date, so `spg` excludes it while
  // `spgAll` — the pool the swap looks in — still has it.
  card({
    ...csvFields,
    name: "Guest From Elsewhere",
    rarity: "special",
    set: "spg",
    collector_number: "21",
    released_at: "2023-01-01",
  }),
];

/** The token set: `t` plus the set code, emblems included. */
const tokens: Card[] = [
  card({ name: "Glass Spirit", type_line: "Token Creature — Spirit", set: tokenSetCode(SET), collector_number: "1" }),
  card({ name: "Insect", type_line: "Token Creature — Insect", set: tokenSetCode(SET), collector_number: "2" }),
  card({ name: "Rat", type_line: "Token Creature — Rat", set: tokenSetCode(SET), collector_number: "3" }),
  card({ name: "Treasure", type_line: "Token Artifact — Treasure", set: tokenSetCode(SET), collector_number: "4" }),
  card({ name: "Emblem", type_line: "Emblem", set: tokenSetCode(SET), collector_number: "5" }),
  {
    id: "two-sided-token",
    name: "Spirit // Insect",
    set: tokenSetCode(SET),
    collector_number: "6",
    card_faces: [
      { name: "Spirit", type_line: "Token Creature — Spirit", image_uris: { normal: "https://img/t1.jpg" } },
      { name: "Insect", type_line: "Token Creature — Insect", image_uris: { normal: "https://img/t2.jpg" } },
    ],
  },
];

const listCard: Card = card({
  name: "The List Pick",
  rarity: "uncommon",
  set: "plst",
  collector_number: "PLST-1",
});

/** The shock lands, for the one separator cycle that is fetched. */
const shockLands: Card[] = [
  "Hallowed Fountain",
  "Watery Grave",
  "Blood Crypt",
].map((name, i) =>
  card({
    name,
    rarity: "rare",
    type_line: "Land — Plains Island",
    set: "rtr",
    collector_number: `${240 + i}`,
  }),
);

const SHOCK = landCycleQuery({
  id: "shock",
  label: "Shock lands",
  names: [
    "Hallowed Fountain",
    "Watery Grave",
    "Blood Crypt",
    "Stomping Ground",
    "Temple Garden",
    "Godless Shrine",
    "Overgrown Tomb",
    "Breeding Pool",
    "Steam Vents",
    "Sacred Foundry",
  ],
});

// ------------------------------------------------------------------
// Commander Masters, for the Commander tab
// ------------------------------------------------------------------
const CMM = "cmm";
export const cmmSet: ScryfallSet = {
  code: CMM,
  name: "Commander Masters",
  set_type: "masters",
  released_at: "2023-08-04",
};

const legend = (name: string, rarity: string, n: number): Card =>
  card({
    name,
    rarity: rarity as Card["rarity"],
    type_line: "Legendary Creature — Horror",
    set: CMM,
    collector_number: `${n}`,
  });

const cmmCommons: Card[] = range(8).map((i) =>
  card({ name: `Masters Common ${i}`, rarity: "common", set: CMM, collector_number: `${10 + i}` }),
);
const cmmUncommons: Card[] = range(8)
  .map((i) =>
    card({ name: `Masters Uncommon ${i}`, rarity: "uncommon", set: CMM, collector_number: `${50 + i}` }),
  )
  .concat(range(4).map((i) => legend(`Legend U ${i}`, "uncommon", 70 + i)));
const cmmRares: Card[] = range(6)
  .map((i) => card({ name: `Masters Rare ${i}`, rarity: "rare", set: CMM, collector_number: `${100 + i}` }))
  .concat(range(3).map((i) => legend(`Legend R ${i}`, "rare", 120 + i)));
const cmmMythics: Card[] = range(3)
  .map((i) => card({ name: `Masters Mythic ${i}`, rarity: "mythic", set: CMM, collector_number: `${150 + i}` }))
  .concat(range(2).map((i) => legend(`Legend M ${i}`, "mythic", 160 + i)));

/** Every query the two implementations may ask for, with its answer. */
export const search: Record<string, Card[]> = {
  // Play pools for dsk
  [poolQuery(`s:${SET} -is:promo r:common -t:basic`)]: [...commons, ...duals],
  [poolQuery(`s:${SET} -is:promo r:uncommon -t:basic`)]: [...uncommons, ...otherLands],
  [poolQuery(`s:${SET} -is:promo r:rare -t:basic`)]: [...rares, dfcRare],
  [poolQuery(`s:${SET} -is:promo r:mythic -t:basic`)]: mythics,
  [poolQuery(`s:${SET} -is:promo t:land -t:basic`)]: [...duals, ...otherLands],
  [poolQuery(`s:${SET} -is:promo (t:basic or (r:common t:land -t:creature))`)]: [
    ...basics,
    ...duals,
  ],
  // No is:booster data for this set, so nothing is filtered out.
  [poolQuery(`s:${SET} -is:promo is:booster -t:basic`)]: [],
  [poolQuery(`set:spg`)]: spg,
  [poolQuery(`set:${tokenSetCode(SET)}`)]: tokens,
  [poolQuery(`${SHOCK} -border:gold -is:oversized`)]: shockLands,

  // Commander pools for cmm
  [poolQuery(`s:${CMM} -is:promo r:common -t:basic`)]: cmmCommons,
  [poolQuery(`s:${CMM} -is:promo r:uncommon -t:basic`)]: cmmUncommons,
  [poolQuery(`s:${CMM} -is:promo r:rare -t:basic`)]: cmmRares,
  [poolQuery(`s:${CMM} -is:promo r:mythic -t:basic`)]: cmmMythics,
  [poolQuery(`s:${CMM} -is:promo is:booster -t:basic`)]: [],
  [poolQuery(`s:${CMM} !"The Prismatic Piper"`)]: [],
  [poolQuery(`set:${tokenSetCode(CMM)}`)]: [],
};

export const sets: Record<string, ScryfallSet> = { [SET]: dskSet, [CMM]: cmmSet };
export const random: Record<string, Card> = { "set:plst": listCard };

export const DEFAULTS: TabOptions = {
  packCount: 2,
  vanilla: false,
  mult: 1,
  preferGuestList: false,
  foilToggle: false,
  listToggle: false,
  includeBonus: true,
  separatorType: "land",
  bonusType: "classic",
  tokenSheets: false,
  landSheet: false,
};

export const PLAY_SELECTION: SetSelection = {
  setSelect: SET,
  customSet: "",
  cmdSource: "official",
  cmdSetSelect: "cmm",
  cmdAnySetSelect: "",
  cmdAnyCustom: "",
  cmdLayout: "cmr",
};

/**
 * The form control values for a given selection and option set.
 *
 * This mapping — old element id to new store field — is the thing the parity
 * test is checking either side of: both implementations are given the same
 * settings, written the way each one expects them.
 */
export function controlsFor(
  selection: SetSelection,
  options: TabOptions,
): Record<string, string | boolean> {
  return {
    packCount: String(options.packCount),
    vanillaToggle: options.vanilla,
    funMultiplier: String(options.mult),
    preferGuestList: options.preferGuestList,
    foilToggle: options.foilToggle,
    listToggle: options.listToggle,
    includeBonus: options.includeBonus,
    separatorType: options.separatorType,
    bonusType: options.bonusType,
    tokenSheets: options.tokenSheets,
    setSelect: selection.setSelect,
    customSet: selection.customSet,
    cmdSource: selection.cmdSource,
    cmdSetSelect: selection.cmdSetSelect,
    cmdAnySetSelect: selection.cmdAnySetSelect,
    cmdAnyCustom: selection.cmdAnyCustom,
    cmdLayout: selection.cmdLayout,
  };
}

/** A small, fast, seedable PRNG. Both sides are given the same seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
