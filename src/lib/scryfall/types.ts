/*
 * The subset of Scryfall's shapes this app actually touches.
 *
 * Hand-written on purpose. `@scryfall/api-types` exists but is at
 * 1.0.0-alpha.4, and this is the one external shape the whole app depends on —
 * an alpha dependency on it would be the riskiest line in the project.
 *
 * `Card` here is deliberately assignable to `Card` in `lib/booster/types.ts`,
 * which declares only the handful of fields the pure logic reads. The
 * assignment is asserted in `tests/scryfall-types.test.ts`, so the pure layer
 * never has to know this file exists.
 */

/** Scryfall omits fields rather than nulling them, so almost all are optional. */
export interface CardFace {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  image_uris?: ImageUris;
}

export interface ImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export type Rarity = "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";

export interface Prices {
  usd?: string | null;
  usd_foil?: string | null;
  eur?: string | null;
  tix?: string | null;
}

export interface Card {
  id: string;
  name: string;
  /** Absent on multi-faced cards; read the faces instead. */
  type_line?: string;
  card_faces?: CardFace[];
  image_uris?: ImageUris;
  mana_cost?: string;
  rarity?: Rarity;
  set?: string;
  set_name?: string;
  collector_number?: string;
  artist?: string;
  /** Plain YYYY-MM-DD. Compared as a string so time zones never enter into it. */
  released_at?: string;
  border_color?: string;
  full_art?: boolean;
  frame_effects?: string[];
  promo?: boolean;
  /** Colours of mana the card can produce — how a common dual land is spotted. */
  produced_mana?: string[];
  prices?: Prices;
  uri?: string;
  scryfall_uri?: string;
  /*
   * Not from Scryfall: the built-in bonus land printings carry a column
   * marker, and the generator reads it back off the card it picked.
   */
  section?: string;
  [key: string]: unknown;
}

export type SetType =
  | "expansion"
  | "core"
  | "masters"
  | "draft_innovation"
  | "commander"
  | "token"
  | "promo"
  | "funny"
  | "memorabilia"
  | "alchemy"
  | "starter"
  | "box"
  | "from_the_vault"
  | "spellbook"
  | "premium_deck"
  | "duel_deck"
  | "treasure_chest"
  | "planechase"
  | "archenemy"
  | "vanguard"
  | "arsenal"
  | "minigame";

export interface ScryfallSet {
  id?: string;
  code: string;
  name: string;
  set_type?: SetType | string;
  /** Absent for sets with no announced date, which count as unreleased. */
  released_at?: string;
  card_count?: number;
  digital?: boolean;
  icon_svg_uri?: string;
  [key: string]: unknown;
}

/** One page of `/cards/search`. */
export interface SearchPage {
  object: "list";
  total_cards?: number;
  has_more?: boolean;
  next_page?: string;
  data: Card[];
}

/** The `/sets` listing. */
export interface SetListResponse {
  object: "list";
  data: ScryfallSet[];
}

/** `unique:` mode. Prints gives every art variant; cards collapses them. */
export type UniqueMode = "prints" | "cards";
