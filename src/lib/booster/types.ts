/*
 * Shapes shared by the pack logic.
 *
 * These were implicit in `js/booster-logic.js`: objects passed between the
 * generator and the "How each card slot is determined" panel, agreed on by
 * convention. Writing them down is most of the value of the port.
 */

/** A random source in [0, 1). Injected so tests can be deterministic. */
export type Rng = () => number;

/*
 * The subset of a Scryfall card the *pure* logic touches. Phase 2 adds the
 * fuller `lib/scryfall/types.ts`; its `Card` is structurally assignable to
 * this, so nothing here has to change then. Everything is optional because
 * Scryfall omits rather than nulls, and double-faced cards carry `type_line`
 * and `image_uris` on their faces instead of the card.
 */
export interface CardFace {
  type_line?: string;
  /*
   * Only its presence is ever checked here — a token counts as double-faced
   * when both faces have images. The pure logic never reads a particular
   * size, so the real Scryfall shape stays in `lib/scryfall/types.ts` and any
   * of it is assignable to this.
   */
  image_uris?: unknown;
}

export interface Card {
  name?: string;
  type_line?: string;
  card_faces?: CardFace[];
  collector_number?: string;
  image_uris?: unknown;
  border_color?: string;
  full_art?: boolean;
  frame_effects?: string[];
  /** Scryfall's finishes for this printing: "nonfoil", "foil", "etched". */
  finishes?: string[];
  [key: string]: unknown;
}

/**
 * Cards grouped by name: one entry per distinct card name, holding every
 * printing of it. Pools are sampled name-first so alternate treatments of one
 * card do not make it more likely than its neighbours.
 */
export type NameMap = Map<string, Card[]>;

/** Diagnostics `loadPlayPools` attaches alongside the pools. Never sampled. */
export interface PoolsMeta {
  boosterFiltered: boolean;
  ownSpg: number;
  landSlotOnly: number;
}

/**
 * A set's pools, keyed by pool name ("commons", "legR", "landDuals"…). The
 * `meta` entry is not a pool; `statsFromPools` counts it as 0.
 */
export type Pools = Record<string, NameMap | PoolsMeta | undefined>;

/** Pool sizes by key — the only thing the spec builders need about a set. */
export type Stats = Record<string, number>;

/**
 * Which pool supplies an outcome. An array is a fallback chain: the first key
 * with cards in it wins, so a set with no Backgrounds or no non-basic lands
 * still fills every guaranteed slot.
 */
export type PoolRef = string | string[];

/**
 * Finish of a card: a probability of traditional foil, or the literal
 * "etched", which is not a chance but a distinct finish.
 */
export type Foil = number | "etched";

/**
 * One possible result for a slot: which pool it draws from, how likely it is,
 * and what finish it comes out in.
 *
 * `p` is null while a set's pools are still loading (`stats === null`); the
 * panel then shows the formula with no number rather than a wrong one.
 */
export interface Outcome {
  pool: PoolRef;
  label: string;
  p: number | null;
  foil?: Foil;
  /** Short marker the UI badges the card with ("The List", "Special Guest"). */
  tag?: string;
  /** Human-readable derivation, shown in the panel. */
  formula?: string;
  /** Rare/mythic in an alternate treatment — God Pack slots only. */
  boosterFun?: boolean;
}

/**
 * A run of `n` consecutive cards in a pack that are all determined the same
 * way, described entirely by its list of outcomes. The generator samples from
 * exactly the outcome list the panel displays, so the explanation cannot drift
 * from what actually happens.
 *
 * `from` and `to` are 1-based card positions, filled in by `finalizeSlots`.
 */
export interface Slot {
  n: number;
  title: string;
  types?: string;
  outcomes: Outcome[];
  /** Option ids that change this slot, for the panel's highlighting. */
  affects?: string[];
  from: number;
  to: number;
}

/** A slot before `finalizeSlots` has placed it in the pack. */
export type SlotDraft = Omit<Slot, "from" | "to">;

/** Options for `playSpec`. */
export interface PlayOptions {
  /** True reproduces a real Play Booster; false is the "fun" mode. */
  vanilla: boolean;
  /** Fun-mode rare/mythic multiplier, 1–5. Ignored when `vanilla`. */
  mult: number;
  /** Fun override: foil the last wildcard whatever its rarity. */
  foilToggle?: boolean;
  /** Fun override: allow The List in slot 7. */
  listToggle?: boolean;
  /** Set is from the MKM–Bloomburrow window, when slot 7 could be The List. */
  listEra?: boolean;
  /** Print every slot non-foil. See `withoutFoils`. */
  noFoils?: boolean;
}

/** The three Commander draft-booster layouts. */
export type CommanderLayout = "cmr" | "clb" | "cmm";

/** Options for `commanderSpec`. */
export interface CommanderOptions {
  vanilla: boolean;
  mult: number;
  /** Print every slot non-foil. See `withoutFoils`. */
  noFoils?: boolean;
}

/** A Commander set the Commander tab supports directly. */
export interface CommanderSet {
  code: string;
  name: string;
  released: string;
}

/** A bonus/separator land cycle offered in the dropdown. */
export interface LandCycle {
  id: string;
  label: string;
  /** Printings ship with the app rather than being queried. */
  builtIn?: boolean;
  names?: string[];
  /** Match by substring, for modal double-faced "Front // Back" names. */
  substring?: boolean;
}

/** Just enough of a Scryfall set object to decide whether it is out yet. */
export interface SetLike {
  released_at?: string;
  released?: string;
  [key: string]: unknown;
}

/**
 * One slot of a token separator sheet: a token on the front and a different
 * one on the back, or a double-faced token showing its own two faces.
 */
export interface TokenSlot {
  card: Card;
  backCard?: Card | null;
  tokenSlot: true;
  /** Padding to fill the last page, rather than a token being covered. */
  filler?: boolean;
}

/** What an option changed about a slot, relative to the same set's vanilla. */
export type DiffChange =
  | { kind: "title"; fromTitle: string; toTitle: string }
  | { kind: "added"; label: string; toP: number | null }
  | { kind: "removed"; label: string; fromP: number | null }
  | { kind: "p"; label: string; fromP: number; toP: number }
  | { kind: "foil"; label: string; fromFoil: Foil; toFoil: Foil };
