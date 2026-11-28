/*
 * The async draft engine.
 *
 * The test that matters is the last one in the file: the same draft, run with
 * the picks arriving in five different orders, comes out identical. That is
 * the claim the whole async design rests on — with the seat order fixed at the
 * start, a pack's contents on any visit depend only on the seats that saw it
 * earlier, so a player taking two days changes when a card is taken and
 * nothing else. If that test ever fails, packs cannot flow freely and the
 * draft has to go back to lockstep.
 *
 * Everything is in opaque card keys, because the engine is: `a1`, `b2`, or
 * `p03-c07` from `cardKey`. No cards, no names, no network.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PASS,
  applyPick,
  cardKey,
  dealPacks,
  isOver,
  nextSeat,
  packStatus,
  passDirection,
  poolKeys,
  queueFor,
  seatOrder,
  shuffled,
  takeCount,
  waitingOn,
} from "@/lib/draft";
import type { DraftRules, DraftState } from "@/lib/draft";

import { seededRng } from "./fixtures";

const rules = (over: Partial<DraftRules> = {}): DraftRules => ({
  seats: 4,
  rounds: 3,
  picksPerTurn: 1,
  pass: DEFAULT_PASS,
  ...over,
});

/** A pool of equal packs, keyed the way the room would key it. */
const pool = (packs: number, size: number): string[][] =>
  poolKeys(Array.from({ length: packs }, () => size));

const start = (r: DraftRules, size = 4, seed = 1): DraftState =>
  dealPacks(pool(r.seats * r.rounds, size), r, seededRng(seed));

/* ---------------------------------------------------------------- moving */

interface Move {
  seat: number;
  packId: string;
  cards: string[];
}

/**
 * Every pick that could legally be made right now.
 *
 * The cards taken are chosen from the pack alone — the front of it — and
 * never from whose turn it is or what that seat already holds. That is what
 * makes the order-independence test meaningful: the strategy cannot smuggle
 * the schedule in through the choice.
 *
 * A seat holding three packs has one legal move, not three: only the pack
 * that has waited longest may be picked from. What the schedulers below
 * still vary, and what order independence is really about, is *who* moves
 * next — not which of their own packs they reach for.
 */
const legalMoves = (s: DraftState): Move[] =>
  s.packs.flatMap((p) =>
    p.holder === null ||
    p.remaining.length === 0 ||
    queueFor(s, p.holder)[0].id !== p.id
      ? []
      : [
          {
            seat: p.holder,
            packId: p.id,
            cards: p.remaining.slice(0, takeCount(s.rules, p)),
          },
        ],
  );

/** Take a turn's worth from the front of a seat's queue — its only move. */
const pickFront = (s: DraftState, seat: number): DraftState => {
  const pack = queueFor(s, seat)[0];
  const res = applyPick(s, {
    seat,
    packId: pack.id,
    cards: pack.remaining.slice(0, takeCount(s.rules, pack)),
  });
  if (!res.ok) throw new Error(res.reason);
  return res.state;
};

type Scheduler = (moves: Move[]) => Move;

const byPack = (a: Move, b: Move) => a.packId.localeCompare(b.packId);

const lowestSeat: Scheduler = (m) =>
  [...m].sort((a, b) => a.seat - b.seat || byPack(a, b))[0];

const highestSeat: Scheduler = (m) =>
  [...m].sort((a, b) => b.seat - a.seat || byPack(a, b))[0];

/** One seat empties everything it is holding before anybody else moves. */
const drain = (): Scheduler => {
  let stuck: number | null = null;
  return (m) => {
    if (stuck === null || !m.some((x) => x.seat === stuck))
      stuck = Math.max(...m.map((x) => x.seat));
    return [...m].filter((x) => x.seat === stuck).sort(byPack)[0];
  };
};

const scattered = (seed: number): Scheduler => {
  const rng = seededRng(seed);
  return (m) => {
    const order = [...m].sort(byPack);
    return order[Math.floor(rng() * order.length)];
  };
};

function run(state: DraftState, next: Scheduler): DraftState {
  let s = state;
  for (let guard = 0; !isOver(s); guard++) {
    if (guard > 10_000) throw new Error("the draft did not finish");
    const moves = legalMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    const res = applyPick(s, next(moves));
    if (!res.ok) throw new Error(`a legal pick was refused: ${res.reason}`);
    s = res.state;
  }
  return s;
}

/** Each seat's cards, sorted — what they drafted, not the order they did. */
const haul = (s: DraftState): string[][] =>
  s.picked.map((t) => t.map((x) => x.card).sort());

/** Each pack's visit history: who saw it and what they took, in order. */
const history = (s: DraftState): Record<string, string[]> => {
  const all = s.picked
    .flatMap((t, seat) => t.map((x) => ({ ...x, seat })))
    .sort((a, b) => a.at - b.at);
  const packs = new Map<string, string[]>();
  for (const t of all)
    packs.set(t.packId, [...(packs.get(t.packId) ?? []), `${t.seat}:${t.card}`]);
  return Object.fromEntries([...packs].sort(([a], [b]) => a.localeCompare(b)));
};

/* ------------------------------------------------------------- the rules */

describe("seats and directions", () => {
  it("passes left up the numbers and right down them, wrapping", () => {
    expect(nextSeat(3, "left", 4)).toBe(0);
    expect(nextSeat(0, "right", 4)).toBe(3);
    expect(nextSeat(1, "left", 4)).toBe(2);
    expect(nextSeat(1, "right", 4)).toBe(0);
  });

  it("gives a one-seat draft itself as its neighbour", () => {
    expect(nextSeat(0, "left", 1)).toBe(0);
    expect(nextSeat(0, "right", 1)).toBe(0);
  });

  it("reads the pass pattern modulo its length", () => {
    /* The default is the paper convention: pack 1 left, 2 right, 3 left. */
    const r = rules();
    expect(r.pass).toEqual(["left", "right", "left"]);
    expect(passDirection(r, 1)).toBe("left");
    expect(passDirection(r, 2)).toBe("right");
    expect(passDirection(r, 3)).toBe("left");
    /* A two-entry pattern over six rounds alternates rather than running out. */
    const alt = rules({ pass: ["right", "left"] });
    expect([1, 2, 3, 4].map((n) => passDirection(alt, n))).toEqual([
      "right",
      "left",
      "right",
      "left",
    ]);
  });
});

describe("dealing", () => {
  it("gives every seat its own pack to open and holds the rest back", () => {
    const r = rules({ seats: 4, rounds: 3 });
    const s = start(r);
    expect(s.packs).toHaveLength(12);
    expect(s.round).toBe(1);

    const open = s.packs.filter((p) => p.round === 1);
    expect(open.map((p) => p.holder).sort()).toEqual([0, 1, 2, 3]);
    expect(open.every((p) => p.holder === p.openedBy)).toBe(true);
    expect(open.every((p) => packStatus(p) === "in-play")).toBe(true);

    const later = s.packs.filter((p) => p.round > 1);
    expect(later.every((p) => packStatus(p) === "unopened")).toBe(true);
    expect(later.every((p) => p.holder === null)).toBe(true);
  });

  it("names a pack for its round and the seat that opens it", () => {
    const s = start(rules({ seats: 2, rounds: 2 }));
    expect(s.packs.map((p) => p.id).sort()).toEqual([
      "r1-s0",
      "r1-s1",
      "r2-s0",
      "r2-s1",
    ]);
  });

  it("refuses a pool that is not seats by rounds", () => {
    expect(() => dealPacks(pool(11, 4), rules(), seededRng(1))).toThrow(
      /needs 12 packs, got 11/,
    );
  });

  it("refuses a pool with a card key used twice", () => {
    /*
     * The engine identifies a card by its key, so a repeated key is two cards
     * that cannot be told apart — and a pick of one would take both.
     */
    const r = rules({ seats: 1, rounds: 2 });
    expect(() =>
      dealPacks([["a1", "a2"], ["a2", "a3"]], r, seededRng(1)),
    ).toThrow(/unique/);
  });

  it("shuffles without mutating, and keeps every item", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    const out = shuffled(items, seededRng(4));
    expect(items).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect([...out].sort()).toEqual([...items].sort());
    expect(seatOrder(items, seededRng(4))).toEqual(out);
  });

  it("keys a card by its generated pack and position", () => {
    expect(cardKey(7, 3)).toBe("p07-c03");
    expect(poolKeys([2, 1])).toEqual([["p00-c00", "p00-c01"], ["p01-c00"]]);
  });
});

describe("picking", () => {
  const r = rules({ seats: 2, rounds: 2, picksPerTurn: 1, pass: ["left"] });
  const dealt = () =>
    dealPacks(
      [
        ["a1", "a2"],
        ["b1", "b2"],
        ["c1", "c2"],
        ["d1", "d2"],
      ],
      r,
      seededRng(5),
    );

  it("takes the card, records it and passes the pack on", () => {
    const s = dealt();
    const mine = queueFor(s, 0)[0];
    const card = mine.remaining[0];

    const res = applyPick(s, { seat: 0, packId: mine.id, cards: [card] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.taken).toEqual([
      { card, packId: mine.id, round: 1, at: 1 },
    ]);
    expect(res.state.picked[0].map((t) => t.card)).toEqual([card]);
    expect(res.state.picked[1]).toEqual([]);

    const moved = res.state.packs.find((p) => p.id === mine.id)!;
    expect(moved.remaining).not.toContain(card);
    expect(moved.holder).toBe(1);
    expect(moved.seen).toEqual([0]);
  });

  it("leaves the state it was given untouched", () => {
    const s = dealt();
    const before = JSON.stringify(s);
    const mine = queueFor(s, 0)[0];
    applyPick(s, { seat: 0, packId: mine.id, cards: [mine.remaining[0]] });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("retires a pack rather than passing an empty one", () => {
    let s = dealt();
    const mine = queueFor(s, 0)[0];

    /*
     * Three picks, not two. When seat 0's pack reaches seat 1 it queues
     * behind seat 1's own, and only the front of a queue may be picked from
     * — so seat 1 clears its own before it can empty this one.
     */
    s = pickFront(s, 0);
    s = pickFront(s, 1);
    s = pickFront(s, 1);

    const spent = s.packs.find((p) => p.id === mine.id)!;
    expect(spent.remaining).toEqual([]);
    expect(spent.holder).toBeNull();
    expect(packStatus(spent)).toBe("spent");
  });

  it("refuses a pack somebody else is holding", () => {
    const s = dealt();
    const theirs = queueFor(s, 1)[0];
    expect(
      applyPick(s, { seat: 0, packId: theirs.id, cards: [theirs.remaining[0]] }),
    ).toEqual({ ok: false, reason: "not-your-pack" });
  });

  it("refuses a pack whose round has not opened", () => {
    const s = dealt();
    const next = s.packs.find((p) => p.round === 2)!;
    expect(
      applyPick(s, {
        seat: next.openedBy,
        packId: next.id,
        cards: [next.remaining[0]],
      }),
    ).toEqual({ ok: false, reason: "not-your-pack" });
  });

  it("refuses a pack that is not there", () => {
    expect(
      applyPick(dealt(), { seat: 0, packId: "r9-s9", cards: ["a1"] }),
    ).toEqual({ ok: false, reason: "no-such-pack" });
  });

  it("refuses the wrong number of cards", () => {
    const s = dealt();
    const mine = queueFor(s, 0)[0];
    expect(
      applyPick(s, { seat: 0, packId: mine.id, cards: mine.remaining }),
    ).toEqual({ ok: false, reason: "wrong-count" });
    expect(applyPick(s, { seat: 0, packId: mine.id, cards: [] })).toEqual({
      ok: false,
      reason: "wrong-count",
    });
  });

  it("refuses a card that is not in the pack", () => {
    const s = dealt();
    const mine = queueFor(s, 0)[0];
    const elsewhere = queueFor(s, 1)[0].remaining[0];
    expect(
      applyPick(s, { seat: 0, packId: mine.id, cards: [elsewhere] }),
    ).toEqual({ ok: false, reason: "not-in-pack" });
  });

  it("refuses the same card twice in one turn", () => {
    const two = rules({ seats: 2, rounds: 1, picksPerTurn: 2, pass: ["left"] });
    const s = dealPacks(
      [
        ["a1", "a2", "a3", "a4"],
        ["b1", "b2", "b3", "b4"],
      ],
      two,
      seededRng(2),
    );
    const mine = queueFor(s, 0)[0];
    const card = mine.remaining[0];
    expect(
      applyPick(s, { seat: 0, packId: mine.id, cards: [card, card] }),
    ).toEqual({ ok: false, reason: "repeated-card" });
  });

  it("refuses everything once the draft is over", () => {
    const s = run(start(rules({ seats: 2, rounds: 1 }), 2, 3), lowestSeat);
    expect(isOver(s)).toBe(true);
    expect(applyPick(s, { seat: 0, packId: "r1-s0", cards: ["x"] })).toEqual({
      ok: false,
      reason: "draft-over",
    });
  });
});

describe("two picks a turn", () => {
  const r = rules({ seats: 2, rounds: 1, picksPerTurn: 2, pass: ["left"] });

  it("takes what is left when a turn would overrun the pack", () => {
    let s = dealPacks(
      [
        ["a1", "a2", "a3"],
        ["b1", "b2", "b3"],
      ],
      r,
      seededRng(1),
    );
    const mine = queueFor(s, 0)[0];
    expect(takeCount(r, mine)).toBe(2);

    const first = applyPick(s, {
      seat: 0,
      packId: mine.id,
      cards: mine.remaining.slice(0, 2),
    });
    if (!first.ok) throw new Error(first.reason);
    s = first.state;

    /*
     * Seat 1 has to clear its own pack first: the one arriving from seat 0 is
     * queued behind it, and a queued pack may not be picked from.
     */
    s = pickFront(s, 1);

    /* One card left, so the turn is one card and asking for two is refused. */
    const rest = s.packs.find((p) => p.id === mine.id)!;
    expect(takeCount(r, rest)).toBe(1);
    expect(
      applyPick(s, { seat: 1, packId: rest.id, cards: ["b1", "b2"] }),
    ).toEqual({ ok: false, reason: "wrong-count" });

    const last = applyPick(s, {
      seat: 1,
      packId: rest.id,
      cards: rest.remaining,
    });
    expect(last.ok).toBe(true);
  });

  it("drafts every card exactly once over a full draft", () => {
    const full = rules({ seats: 4, rounds: 3, picksPerTurn: 2 });
    const s = run(start(full, 15, 11), scattered(3));
    const drafted = s.picked.flat().map((t) => t.card);
    expect(drafted).toHaveLength(4 * 3 * 15);
    expect(new Set(drafted).size).toBe(drafted.length);
  });
});

describe("rounds", () => {
  it("passes a pack right all the way round when the round says right", () => {
    const r = rules({ seats: 4, rounds: 1, picksPerTurn: 1, pass: ["right"] });
    const s = run(start(r, 4, 3), lowestSeat);
    for (const p of s.packs)
      expect(p.seen).toEqual([0, 1, 2, 3].map((i) => (p.openedBy - i + 4) % 4));
  });

  it("and left when it says left", () => {
    const r = rules({ seats: 4, rounds: 1, picksPerTurn: 1, pass: ["left"] });
    const s = run(start(r, 4, 3), lowestSeat);
    for (const p of s.packs)
      expect(p.seen).toEqual([0, 1, 2, 3].map((i) => (p.openedBy + i) % 4));
  });

  it("does not open the next round until every pack of this one is empty", () => {
    const r = rules({ seats: 2, rounds: 2, picksPerTurn: 1, pass: ["left"] });
    let s = dealPacks(
      [
        ["a1", "a2"],
        ["b1", "b2"],
        ["c1", "c2"],
        ["d1", "d2"],
      ],
      r,
      seededRng(5),
    );

    /*
     * Empty one of the two round-1 packs completely. Three picks: seat 1
     * clears its own pack before the one arriving from seat 0 reaches the
     * front of its queue.
     */
    const first = queueFor(s, 0)[0].id;
    s = pickFront(s, 0);
    s = pickFront(s, 1);
    s = pickFront(s, 1);
    expect(s.packs.find((p) => p.id === first)!.remaining).toEqual([]);
    expect(s.round).toBe(1);
    expect(
      s.packs.filter((p) => p.round === 2).every((p) => p.holder === null),
    ).toBe(true);

    /* Now the other one, which is the last of the round and sits with 0. */
    s = pickFront(s, 0);
    expect(s.packs.filter((p) => p.round === 1).every((q) => !q.remaining.length)).toBe(true);
    expect(s.round).toBe(2);
    const opened = s.packs.filter((p) => p.round === 2);
    expect(opened.every((p) => p.holder === p.openedBy)).toBe(true);
  });

  it("ends the draft when the last pack of the last round empties", () => {
    const r = rules({ seats: 3, rounds: 2, picksPerTurn: 1 });
    const s = run(start(r, 6, 8), scattered(5));
    expect(s.round).toBe(3);
    expect(isOver(s)).toBe(true);
    expect(s.packs.every((p) => packStatus(p) === "spent")).toBe(true);
    expect(s.picked.map((t) => t.length)).toEqual([12, 12, 12]);
  });
});

describe("the board", () => {
  it("queues a seat's packs oldest first, and only lets it pick from the front", () => {
    /*
     * A queue needs three seats. Passing left, a seat hands its pack to the
     * seat above and receives from the seat below, so with two seats the packs
     * simply swap and nobody ever holds two. With three, seat 0 picking puts a
     * second pack in front of seat 1 while seat 2 has not moved at all —
     * which is exactly the pile-up the async draft is built to allow.
     */
    const r = rules({ seats: 3, rounds: 1, picksPerTurn: 1, pass: ["left"] });
    const s = dealPacks(
      [
        ["a1", "a2", "a3"],
        ["b1", "b2", "b3"],
        ["c1", "c2", "c3"],
      ],
      r,
      seededRng(5),
    );
    const own = queueFor(s, 1)[0].id;
    const handed = queueFor(s, 0)[0];

    const res = applyPick(s, {
      seat: 0,
      packId: handed.id,
      cards: [handed.remaining[0]],
    });
    if (!res.ok) throw new Error(res.reason);

    const queue = queueFor(res.state, 1);
    expect(queue.map((p) => p.id)).toEqual([own, handed.id]);
    expect(queue.map((p) => p.arrived)).toEqual([0, 1]);

    /*
     * The newer one is refused, and refused with the answer a pack sitting
     * with somebody else gets. That sameness is the point: the cards in a
     * queued pack are withheld, so a refusal must not confirm a guess at
     * them. A card that really is in it and a card that is not get the same
     * two words back.
     */
    const same = { ok: false, reason: "not-your-pack" };
    expect(
      applyPick(res.state, {
        seat: 1,
        packId: handed.id,
        cards: [queue[1].remaining[0]],
      }),
    ).toEqual(same);
    expect(
      applyPick(res.state, {
        seat: 1,
        packId: handed.id,
        cards: ["no-such-card"],
      }),
    ).toEqual(same);

    /* The one that has waited longest goes through. */
    expect(
      applyPick(res.state, {
        seat: 1,
        packId: own,
        cards: [queue[0].remaining[0]],
      }).ok,
    ).toBe(true);
  });

  it("lists who is holding things up, longest wait first", () => {
    const r = rules({ seats: 3, rounds: 1, picksPerTurn: 1, pass: ["left"] });
    const s = start(r, 6, 2);
    expect(waitingOn(s)).toEqual([0, 1, 2]);

    const mine = queueFor(s, 0)[0];
    const res = applyPick(s, {
      seat: 0,
      packId: mine.id,
      cards: [mine.remaining[0]],
    });
    if (!res.ok) throw new Error(res.reason);
    /*
     * Seat 0 drops off the list rather than going to the back of it: passing
     * left it hands its pack to seat 1 and receives from seat 2, who has not
     * picked, so for the moment it is holding nothing and is waiting on seat 2
     * as much as anyone is.
     */
    expect(waitingOn(res.state)).toEqual([1, 2]);
    expect(queueFor(res.state, 0)).toEqual([]);
    expect(queueFor(res.state, 1)).toHaveLength(2);
  });

  it("has nobody waiting once the draft is over", () => {
    const s = run(start(rules({ seats: 2, rounds: 1 }), 4, 6), lowestSeat);
    expect(waitingOn(s)).toEqual([]);
  });
});

/* ------------------------------------------------------- the whole point */

describe("order independence", () => {
  const schedules = (): [string, Scheduler][] => [
    ["lowest seat first", lowestSeat],
    ["highest seat first", highestSeat],
    ["one seat at a time", drain()],
    ["scattered", scattered(7)],
    ["scattered again", scattered(99)],
  ];

  it("is the same draft whatever order the picks arrive in", () => {
    const dealt = start(rules({ seats: 4, rounds: 3, picksPerTurn: 1 }), 5, 42);
    const runs = schedules().map(([name, sched]) => [name, run(dealt, sched)] as const);
    const [, first] = runs[0];

    for (const [name, s] of runs.slice(1)) {
      expect(haul(s), name).toEqual(haul(first));
      expect(history(s), name).toEqual(history(first));
      expect(
        s.packs.map((p) => [p.id, p.seen] as const).sort(),
        name,
      ).toEqual(first.packs.map((p) => [p.id, p.seen] as const).sort());
    }
  });

  it("holds with two picks a turn and an odd pack size", () => {
    const dealt = start(rules({ seats: 4, rounds: 2, picksPerTurn: 2 }), 7, 13);
    const runs = schedules().map(([, sched]) => run(dealt, sched));
    for (const s of runs.slice(1)) {
      expect(haul(s)).toEqual(haul(runs[0]));
      expect(history(s)).toEqual(history(runs[0]));
    }
  });

  it("drafts the whole pool, once each, however it is scheduled", () => {
    const dealt = start(rules({ seats: 6, rounds: 3, picksPerTurn: 1 }), 14, 21);
    const all = dealt.packs.flatMap((p) => p.remaining).sort();
    for (const [name, sched] of schedules()) {
      const s = run(dealt, sched);
      expect(s.picked.flat().map((t) => t.card).sort(), name).toEqual(all);
      expect(s.picked.map((t) => t.length), name).toEqual(
        Array(6).fill(3 * 14),
      );
    }
  });
});
