/*
 * The room: a draft with people in it, and the one port to storage.
 *
 * Everything here is shapes and an interface. The reason the interface exists
 * rather than the operations talking to Postgres directly is that the
 * conditional writes *are* the correctness argument — `putDraft` is only safe
 * because it is conditional on `rev`, and `addPlayer` is only safe because the
 * room-full check happens inside it. A fake that honoured neither would let
 * the tests pass while the real thing lost picks, so the fake in
 * `tests/memory-store.ts` implements both conditions, and the tests race it.
 */
/*
 * Relative, not `@/lib/draft`, and the same below in `ops.ts`: these files are
 * bundled into a Netlify function as well as into the app, and a path alias is
 * something Next's bundler knows about that the function bundler does not.
 */
import type { Deck } from "../draft/deck";
import type {
  DraftRules,
  DraftState,
  Pool,
  PoolSummary,
} from "../draft/types";

/**
 * The layout version of `DraftState` and `Pool` as stored.
 *
 * Bumped by any deploy that changes either shape. A room at an older version
 * is refused rather than read as though it were current — which is what stops
 * a deploy landing mid-draft from quietly misreading a draft in progress.
 * There is no migration path on purpose: a draft takes days, not years, and
 * guessing at an old shape is worse than saying so.
 */
export const SHAPE = 1;

export type Phase = "setup" | "drafting" | "building" | "closed";

/** Why a join did or did not happen — the three the store can tell apart. */
export type JoinOutcome = "joined" | "room-full" | "name-taken";

/** One row of `draft`. */
export interface DraftRow {
  code: string;
  phase: Phase;
  shape: number;
  /** Optimistic lock. Every write to `state` bumps it. */
  rev: number;
  rules: DraftRules;
  /** Empty until the draft is dealt. */
  pool: Pool;
  /** Null until the draft is dealt. */
  state: DraftState | null;
  /** How the pool was made. Null until it is dealt, and for older rooms. */
  summary: PoolSummary | null;
  /**
   * Which seat each player id sits in, empty until the draft is dealt.
   *
   * It lives in this row rather than in a column of `player` so that dealing
   * is one conditional write: a draft whose packs were shuffled by one deal
   * and whose seats came from another is not a state worth being able to
   * represent, and two clicks of Start is how you would get one.
   */
  seats: Record<string, number>;
  adminHash: string;
  /** How many people may join. The seat count is fixed at the deal. */
  maxSeats: number;
  printBasics: boolean;
  createdAt: string;
}

/**
 * One row of `player`. Which seat they got is in `DraftRow.seats`, not here.
 */
export interface PlayerRow {
  code: string;
  id: string;
  name: string;
  keyHash: string;
  joinedAt: string;
  /**
   * What they are building, saved as they go. Null until they save one.
   *
   * On the player's own row rather than in the draft row, which is the whole
   * reason a half-built deck can be saved at all: nobody else writes this
   * blob, so there is no revision to lose and no reason to make somebody
   * finish in one sitting.
   */
  deck?: Deck | null;
  /** When they said it was finished. Null while it is still a draft of one. */
  submittedAt?: string | null;
}

/** One row of `pick`: append-only, and never read while drafting. */
export interface PickRow {
  code: string;
  /** `state.clock` after the pick. Unique within a draft. */
  at: number;
  seat: number;
  packId: string;
  cards: string[];
}

/** The parts of a draft row a write may change. */
export type DraftPatch = Partial<
  Pick<
    DraftRow,
    "phase" | "rules" | "pool" | "state" | "seats" | "summary" | "printBasics"
  >
>;

export interface Store {
  /** False when that code is already taken, so the caller draws another. */
  createDraft(row: DraftRow): Promise<boolean>;
  getDraft(code: string): Promise<DraftRow | null>;
  /**
   * Conditional on `rev`. False means another request wrote first and this
   * caller's `state` was computed from a version that no longer exists — it
   * must re-read rather than retry blindly.
   */
  putDraft(code: string, rev: number, patch: DraftPatch): Promise<boolean>;
  listPlayers(code: string): Promise<PlayerRow[]>;
  /**
   * Both checks belong in here rather than in the caller, because both have to
   * happen in the same statement as the insert — otherwise two people join the
   * last seat at once, or two people join under one name.
   */
  addPlayer(row: PlayerRow, maxSeats: number): Promise<JoinOutcome>;
  /**
   * Save a player's deck, submitted or not. False if there is no such player.
   *
   * Unconditional, unlike every other write here, and safe for the same
   * reason it is useful: a player's row is written by that player alone.
   */
  putDeck(
    code: string,
    playerId: string,
    deck: Deck | null,
    submittedAt: string | null,
  ): Promise<boolean>;
  logPicks(rows: PickRow[]): Promise<void>;
}
