/*
 * Who may see what.
 *
 * The test that earns its place is the first one: every card key and every
 * Scryfall id in the pool is searched for in the serialised board, because
 * hidden information in a draft is a security property rather than a
 * rendering choice. A pack sitting with another player has to be unreachable,
 * not merely undrawn, and `BoardView` is the shape that goes to everybody.
 */
import { describe, expect, it } from "vitest";

import { applyPick, boardView, dealPacks, poolKeys, queueFor, seatView } from "@/lib/draft";
import type { DraftRules, DraftState, Pool } from "@/lib/draft";

import { seededRng } from "./fixtures";

const RULES: DraftRules = {
  seats: 4,
  rounds: 2,
  picksPerTurn: 1,
  pass: ["right", "left"],
};

const NAMES = ["Ada", "Bram", "Cleo", "Dev"];

const setup = (
  rules: DraftRules = RULES,
  size = 5,
  seed = 9,
): { pool: Pool; state: DraftState } => {
  const keys = poolKeys(
    Array.from({ length: rules.seats * rules.rounds }, () => size),
  );
  const pool: Pool = {};
  keys.forEach((pack, i) =>
    pack.forEach((key, j) => {
      pool[key] = {
        id: `scryfall-${i}-${j}`,
        finish: j === 0 ? "foil" : "nonfoil",
      };
    }),
  );
  return { pool, state: dealPacks(keys, rules, seededRng(seed)) };
};

/** Take one card from whoever holds `pack`, to get some picks on the board. */
const pickOnce = (state: DraftState, packId: string): DraftState => {
  const pack = state.packs.find((p) => p.id === packId)!;
  const res = applyPick(state, {
    seat: pack.holder!,
    packId,
    cards: pack.remaining.slice(0, 1),
  });
  if (!res.ok) throw new Error(res.reason);
  return res.state;
};

describe("the board", () => {
  it("carries no card at all, not a key and not an id", () => {
    const { pool, state } = setup();
    /* Play a few picks first, so there is something worth leaking. */
    let s = state;
    for (const id of ["r1-s0", "r1-s1", "r1-s0"]) s = pickOnce(s, id);

    const json = JSON.stringify(boardView(s, NAMES));
    for (const key of Object.keys(pool)) expect(json).not.toContain(key);
    for (const card of Object.values(pool)) expect(json).not.toContain(card.id);
  });

  it("counts what everybody is allowed to know", () => {
    const { state } = setup();
    const board = boardView(state, NAMES);

    expect(board.round).toBe(1);
    expect(board.rounds).toBe(2);
    expect(board.over).toBe(false);
    expect(board.waitingOn).toEqual([0, 1, 2, 3]);
    expect(board.seats).toEqual([
      { seat: 0, name: "Ada", drafted: 0, holding: 1, waitingSince: 0 },
      { seat: 1, name: "Bram", drafted: 0, holding: 1, waitingSince: 0 },
      { seat: 2, name: "Cleo", drafted: 0, holding: 1, waitingSince: 0 },
      { seat: 3, name: "Dev", drafted: 0, holding: 1, waitingSince: 0 },
    ]);
  });

  it("follows the pile-up, so the admin can see who is holding it up", () => {
    const { state } = setup();
    /* Passing right in round 1, seat 0 hands to seat 3 and receives from 1. */
    const after = pickOnce(state, "r1-s0");
    const board = boardView(after, NAMES);

    expect(board.seats[0]).toMatchObject({ drafted: 1, holding: 0 });
    expect(board.seats[0].waitingSince).toBeNull();
    expect(board.seats[3]).toMatchObject({ drafted: 0, holding: 2 });
    expect(board.waitingOn[0]).toBe(1);
    expect(board.waitingOn).not.toContain(0);
  });

  it("names a seat nobody has claimed as nothing rather than undefined", () => {
    const { state } = setup();
    expect(boardView(state, ["Ada"]).seats.map((s) => s.name)).toEqual([
      "Ada",
      "",
      "",
      "",
    ]);
  });
});

describe("a seat's own view", () => {
  it("shows the packs it holds and resolves them against the pool", () => {
    const { pool, state } = setup();
    const you = seatView(state, pool, 2);
    const mine = queueFor(state, 2);

    expect(you.seat).toBe(2);
    expect(you.queue).toHaveLength(1);
    expect(you.queue[0].id).toBe(mine[0].id);
    expect(you.queue[0].take).toBe(1);
    expect(you.queue[0].cards.map((c) => c.key)).toEqual(mine[0].remaining);
    for (const card of you.queue[0].cards)
      expect(card).toEqual({ key: card.key, ...pool[card.key] });
  });

  it("shows nobody else's packs", () => {
    const { pool, state } = setup();
    const mine = new Set(queueFor(state, 1).map((p) => p.id));
    expect(seatView(state, pool, 1).queue.map((p) => p.id)).toEqual([
      ...mine,
    ]);
    /* And the other three packs are in play, so they were really withheld. */
    expect(state.packs.filter((p) => p.holder !== null)).toHaveLength(4);
  });

  it("lists what it has drafted, in the order it took it", () => {
    const { pool, state } = setup();
    /*
     * Two picks for one seat takes three moves. Round 1 passes right, so seat
     * 0 hands its pack to seat 3 and is holding nothing until seat 1 picks and
     * passes down to it — a seat that has just picked is empty-handed, which
     * is the pile-up the async draft is for.
     */
    let s = state;
    const want: string[] = [];

    const own = queueFor(s, 0)[0];
    want.push(own.remaining[0]);
    s = pickOnce(s, own.id);
    expect(queueFor(s, 0)).toEqual([]);

    s = pickOnce(s, queueFor(s, 1)[0].id);

    const arrived = queueFor(s, 0)[0];
    want.push(arrived.remaining[0]);
    s = pickOnce(s, arrived.id);
    expect(seatView(s, pool, 0).drafted.map((c) => c.key)).toEqual(want);
    expect(seatView(s, pool, 0).drafted.map((c) => c.id)).toEqual(
      want.map((k) => pool[k].id),
    );
  });

  it("says a turn takes what is left when two would overrun the pack", () => {
    const two: DraftRules = { ...RULES, rounds: 1, picksPerTurn: 2 };
    const { pool, state } = setup(two, 3, 4);
    expect(seatView(state, pool, 0).queue[0].take).toBe(2);

    const pack = queueFor(state, 0)[0];
    const res = applyPick(state, {
      seat: 0,
      packId: pack.id,
      cards: pack.remaining.slice(0, 2),
    });
    if (!res.ok) throw new Error(res.reason);
    /*
     * The seat it lands on is holding two packs now — its own, untouched, and
     * this one with a single card left — so the queue has to be searched
     * rather than indexed: `queue[0]` is whichever arrived first, which is its
     * own.
     */
    const next = res.state.packs.find((p) => p.id === pack.id)!;
    const queue = seatView(res.state, pool, next.holder!).queue;
    expect(queue).toHaveLength(2);
    expect(queue.find((p) => p.id === pack.id)!.take).toBe(1);
    expect(queue[0].take).toBe(2);
  });

  it("refuses to render a pack the pool has lost a card from", () => {
    const { pool, state } = setup();
    const holed: Pool = { ...pool };
    delete holed[queueFor(state, 0)[0].remaining[0]];
    expect(() => seatView(state, holed, 0)).toThrow(/no card for key/);
  });
});
