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

import {
  applyPick,
  boardView,
  dealPacks,
  poolKeys,
  queueFor,
  seatView,
  takeCount,
} from "@/lib/draft";
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
    /* One each, so no pack is picked from while queued behind another. */
    for (const id of ["r1-s0", "r1-s1", "r1-s2"]) s = pickOnce(s, id);

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
    expect(you.waiting).toBe(0);
    expect(you.pack!.id).toBe(mine[0].id);
    expect(you.pack!.take).toBe(1);
    expect(you.pack!.cards.map((c) => c.key)).toEqual(mine[0].remaining);
    for (const card of you.pack!.cards)
      expect(card).toEqual({ key: card.key, ...pool[card.key] });
  });

  it("shows nobody else's packs", () => {
    const { pool, state } = setup();
    const mine = queueFor(state, 1);
    expect(seatView(state, pool, 1).pack!.id).toBe(mine[0].id);
    /* And the other three packs are in play, so they were really withheld. */
    expect(state.packs.filter((p) => p.holder !== null)).toHaveLength(4);
  });

  it("withholds the cards of a pack queued behind the front one", () => {
    const { pool, state } = setup();
    /*
     * Round 1 passes right, so seat 0's pack lands on seat 3, which is still
     * holding its own. That seat now has a queue, and everything in the pack
     * at the back of it is a future pick.
     */
    const s = pickOnce(state, "r1-s0");
    const held = queueFor(s, 3);
    expect(held).toHaveLength(2);

    const you = seatView(s, pool, 3);
    expect(you.pack!.id).toBe(held[0].id);
    expect(you.waiting).toBe(1);

    /*
     * Searched for rather than asserted structurally, the way the board test
     * does it: what matters is that nothing anywhere in what this seat is
     * sent names a card it may not see yet, however the shape changes later.
     */
    const behind = held[1];
    const json = JSON.stringify(you);
    for (const key of behind.remaining) {
      expect(json).not.toContain(key);
      expect(json).not.toContain(pool[key].id);
    }
    /* Nor the pack's id: an id is the whole of what a pick needs to name. */
    expect(json).not.toContain(behind.id);
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
    expect(seatView(state, pool, 0).pack!.take).toBe(2);

    const pack = queueFor(state, 0)[0];
    const res = applyPick(state, {
      seat: 0,
      packId: pack.id,
      cards: pack.remaining.slice(0, 2),
    });
    if (!res.ok) throw new Error(res.reason);
    /*
     * The seat it lands on is holding two packs now — its own, untouched,
     * and this one with a single card left. Its own arrived first, so that
     * is the one it sees and the one it may pick from; the arrival is a
     * count behind it until that is gone.
     */
    const next = res.state.packs.find((p) => p.id === pack.id)!;
    const held = queueFor(res.state, next.holder!);
    expect(held).toHaveLength(2);
    expect(held[0].id).not.toBe(pack.id);
    expect(takeCount(two, held.find((p) => p.id === pack.id)!)).toBe(1);

    const seen = seatView(res.state, pool, next.holder!);
    expect(seen.pack!.id).toBe(held[0].id);
    expect(seen.pack!.take).toBe(2);
    expect(seen.waiting).toBe(1);
  });

  it("refuses to render a pack the pool has lost a card from", () => {
    const { pool, state } = setup();
    const holed: Pool = { ...pool };
    delete holed[queueFor(state, 0)[0].remaining[0]];
    expect(() => seatView(state, holed, 0)).toThrow(/no card for key/);
  });
});
