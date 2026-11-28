/*
 * What a player may see, and what everybody may see — as two functions, so
 * the type system keeps them apart.
 *
 * Hidden information is a security property here rather than a rendering
 * choice. In the rest of the app the preview showing pack 3 is a decision
 * about what to draw; in a draft, the cards sitting with another player have
 * to be *unreachable*, not merely undrawn. That is why the split is two
 * functions with two return types instead of one function with a flag: a
 * `BoardView` has nowhere to put a card, so a handler cannot leak one into it
 * by accident, and `tests/draft-view.test.ts` asserts that by searching the
 * serialised board for every id in the pool.
 */
import { isOver, queueFor, takeCount, waitingOn } from "./engine";
import type { CardRef, DraftState, Pool } from "./types";

/** One pack, as the seat holding it sees it. */
export interface PackView {
  id: string;
  round: number;
  /** `state.clock` when it arrived. Orders the queue; also "waiting since". */
  arrived: number;
  /** How many cards this turn takes — a turn's worth, or what is left. */
  take: number;
  /** What is still in it, in the order it was packed. */
  cards: CardRef[];
}

/** One seat, as everybody sees it. Counts only: no card ever appears here. */
export interface SeatSummary {
  seat: number;
  name: string;
  /** Cards drafted so far. */
  drafted: number;
  /** Packs sitting with this seat right now. */
  holding: number;
  /** `state.clock` when its longest-held pack arrived, or null if none. */
  waitingSince: number | null;
}

/** The board: enough to see how the draft is going, and whose move it is. */
export interface BoardView {
  round: number;
  rounds: number;
  over: boolean;
  seats: SeatSummary[];
  /** Seats holding a pack, longest wait first. */
  waitingOn: number[];
}

/** One seat's own hand of information. */
export interface SeatView {
  seat: number;
  /**
   * The pack in front of this seat, or null when none has reached it.
   *
   * One pack rather than the queue, and a field rather than `queue[0]`,
   * because the cards in the packs stacked behind it are hidden information
   * in the same way another seat's are. A draft hands you one pack at a time;
   * knowing what is in the next two is foresight the table does not have, and
   * it would change how you pick from this one. The shape is what enforces
   * it: there is nowhere here to put a second pack's cards.
   */
  pack: PackView | null;
  /** How many more are stacked behind it. A count: no card appears here. */
  waiting: number;
  /** Everything this seat has drafted, in the order it took it. */
  drafted: CardRef[];
}

const refer = (pool: Pool, key: string): CardRef => {
  const card = pool[key];
  /*
   * A key with nothing behind it means the pool and the state disagree, which
   * is corruption rather than a missing card. Better to fail the request than
   * to render a pack with a hole in it and let somebody pick around it.
   */
  if (!card) throw new Error(`draft pool has no card for key ${key}`);
  return { key, ...card };
};

/** Card keys as the cards they stand for, in order. */
export const cardRefs = (pool: Pool, keys: readonly string[]): CardRef[] =>
  keys.map((key) => refer(pool, key));

export function boardView(
  state: DraftState,
  names: readonly (string | undefined)[],
): BoardView {
  const seats: SeatSummary[] = [];
  for (let seat = 0; seat < state.rules.seats; seat++) {
    const held = queueFor(state, seat);
    seats.push({
      seat,
      name: names[seat] ?? "",
      drafted: state.picked[seat]?.length ?? 0,
      holding: held.length,
      waitingSince: held.length ? held[0].arrived : null,
    });
  }
  return {
    round: state.round,
    rounds: state.rules.rounds,
    over: isOver(state),
    seats,
    waitingOn: waitingOn(state),
  };
}

export function seatView(
  state: DraftState,
  pool: Pool,
  seat: number,
): SeatView {
  const [front, ...behind] = queueFor(state, seat);
  return {
    seat,
    pack: front
      ? {
          id: front.id,
          round: front.round,
          arrived: front.arrived,
          take: takeCount(state.rules, front),
          cards: front.remaining.map((key) => refer(pool, key)),
        }
      : null,
    /*
     * The count, and not the ids: an id is enough to pick with, and a pack
     * that may not be picked from yet should not be addressable either.
     */
    waiting: behind.length,
    drafted: (state.picked[seat] ?? []).map((t) => refer(pool, t.card)),
  };
}
