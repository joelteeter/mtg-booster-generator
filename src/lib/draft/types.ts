/*
 * Shapes for the async draft.
 *
 * The draft is a state machine over opaque card keys: no cards, no players,
 * no network. A room supplies the keys and the names and keeps the mapping
 * back to real printings; everything here is the rules, so the rules can be
 * tested without any of that existing.
 *
 * A **card key** names one physical card in the pool and must be unique
 * across the whole draft — `dealPacks` refuses a pool where it is not. That
 * is what lets a pick say "this card" unambiguously when a pack holds two
 * copies of the same printing, which generated packs do.
 */

/**
 * A random source in [0, 1), injected so a deal can be replayed.
 *
 * Declared here rather than imported from `lib/booster`, identical though it
 * is, because this module is bundled into a Netlify function as well as into
 * the app: it has to stand alone, with no path alias to resolve.
 */
export type Rng = () => number;

/** Which way a pack moves between seats. */
export type Direction = "left" | "right";

/**
 * Seats are numbered 0 to `seats - 1` and "left" is the next number up.
 * Nothing physical hangs on which way round the table that is — only that
 * left and right are opposite, and that a round agrees with itself.
 */
export interface DraftRules {
  seats: number;
  /** Packs per player, and so the number of rounds. */
  rounds: number;
  /** Cards taken on one visit: 1 for a normal draft, 2 for commander. */
  picksPerTurn: number;
  /**
   * Direction by round, round 1 first, read modulo its length — so three
   * rounds of left, right, left is the list as written, and a shorter list
   * repeats rather than running out.
   */
  pass: Direction[];
}

/** One card leaving a pack, from the drafter's side. */
export interface Taken {
  card: string;
  packId: string;
  round: number;
  /** `state.clock` when it was taken: one global ordering over the draft. */
  at: number;
}

/** A pack: what is left of it, and where it is sitting. */
export interface PackState {
  /** `r2-s5`, the round and the seat that opens it, which is unique. */
  id: string;
  round: number;
  openedBy: number;
  /** Cards not yet taken, in the order they were packed. */
  remaining: string[];
  /** The seat it is sitting with, or null when it is not in play. */
  holder: number | null;
  /** Every seat that has picked from it, in the order they did. */
  seen: number[];
  /** `state.clock` when it arrived where it is. Orders a seat's queue. */
  arrived: number;
}

/**
 * Derived rather than stored, because it is already written down twice over:
 * a pack with nothing left is spent, and a pack nobody holds whose round has
 * not come round yet is unopened.
 */
export type PackStatus = "unopened" | "in-play" | "spent";

export interface DraftState {
  rules: DraftRules;
  /** 1-based. `rules.rounds + 1` means the draft is over. */
  round: number;
  packs: PackState[];
  /** What each seat has taken, in the order they took it. */
  picked: Taken[][];
  /** Picks made so far. Also the arrival clock — see `PackState.arrived`. */
  clock: number;
}

export interface Pick {
  seat: number;
  packId: string;
  /** Exactly `picksPerTurn` cards, or the whole of a shorter remainder. */
  cards: string[];
}

/**
 * Why a pick was not applied.
 *
 * None of these is a rule a player can break by playing badly — they are a
 * stale page or a bug. `not-your-pack` is the one that happens in normal use:
 * two people picked at once and this one lost.
 */
export type PickRefusal =
  | "draft-over"
  | "no-such-pack"
  | "not-your-pack"
  | "wrong-count"
  | "not-in-pack"
  | "repeated-card";

export type PickResult =
  | { ok: true; state: DraftState; taken: Taken[] }
  | { ok: false; reason: PickRefusal };

/**
 * What a card key stands for. The engine never reads this — only the view
 * does, when it turns a seat's queue into something to look at.
 */
export interface PoolCard {
  /** Scryfall id. */
  id: string;
  /** "nonfoil", "foil" or "etched", as `PackEntry.finish`. */
  finish: string;
}

/** Every card in the draft, by key. Fixed once the draft is dealt. */
export type Pool = Record<string, PoolCard>;

/** A card as the view hands it over: the key, and what it stands for. */
export interface CardRef extends PoolCard {
  key: string;
}
