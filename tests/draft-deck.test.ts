/*
 * Building a deck out of what you drafted, and handing it in.
 *
 * The rules are checked once, in `lib/draft/deck.ts`, and both the browser
 * and the function call it — so the first half of this file is the only place
 * legality is decided, and the second half is about what happens around it:
 * that a half-built deck can be saved, that only a finished one is checked,
 * and that editing a submitted deck takes it back off the pile.
 */
import { describe, expect, it } from "vitest";

import {
  BASICS,
  DECK_MIN,
  SIDEBOARD_MAX,
  checkDeck,
  emptyDeck,
  poolOf,
  problemText,
  queueFor,
} from "@/lib/draft";
import type { Deck } from "@/lib/draft";
import {
  createRoom,
  joinRoom,
  makePick,
  readRoom,
  saveDeck,
  startDraft,
  unlockDeck,
} from "@/lib/room";

import { seededRng } from "./fixtures";
import { MemoryStore } from "./memory-store";

/** Twenty-five cards, which is about what a seat drafts from three packs. */
const POOL = Array.from({ length: 25 }, (_, i) => `c${String(i).padStart(2, "0")}`);

const deck = (over: Partial<Deck> = {}): Deck => ({ ...emptyDeck(), ...over });

/*
 * Basics the type does not allow, because the check exists for data off the
 * wire — a posted deck is `unknown` until it has been looked at, and
 * `unknown-basic` is what looking at it finds.
 */
const odd = (basics: Record<string, number>) => basics as Deck["basics"];

/** A legal deck: 23 drafted cards and 17 basics. */
const legal = (pool: readonly string[] = POOL): Deck =>
  deck({ main: [...pool].slice(0, 23), basics: { Forest: 9, Island: 8 } });

/* ------------------------------------------------------------- the rules */

describe("what makes a deck", () => {
  it("accepts forty cards with the basics counted in", () => {
    const got = checkDeck(legal(), POOL);
    expect(got).toMatchObject({
      ok: true,
      problems: [],
      cards: 23,
      basics: 17,
      total: 40,
      side: 0,
    });
  });

  it("counts basics towards the forty, since nobody drafts a Forest", () => {
    /* The same 23 cards without the lands is not a deck. */
    expect(checkDeck(deck({ main: POOL.slice(0, 23) }), POOL)).toMatchObject({
      ok: false,
      total: 23,
      problems: [{ kind: "too-small", have: 23, need: DECK_MIN }],
    });
    /* And forty drafted cards with no basics is. */
    const big = Array.from({ length: 40 }, (_, i) => `b${i}`);
    expect(checkDeck(deck({ main: big }), big).ok).toBe(true);
  });

  it("refuses a card you did not draft", () => {
    const got = checkDeck(
      deck({ main: [...POOL.slice(0, 22), "somebody-elses"], basics: { Plains: 18 } }),
      POOL,
    );
    expect(got.ok).toBe(false);
    expect(got.problems).toContainEqual({
      kind: "not-yours",
      card: "somebody-elses",
    });
  });

  it("refuses the same card twice, because you only opened one", () => {
    const got = checkDeck(
      deck({ main: [...POOL.slice(0, 22), POOL[0]], basics: { Plains: 18 } }),
      POOL,
    );
    expect(got.problems).toContainEqual({ kind: "repeated", card: POOL[0] });
  });

  it("names a card in the deck and the sideboard as its own mistake", () => {
    /*
     * Which is the one a builder actually makes: moving a card across
     * without taking it out of where it was.
     */
    const got = checkDeck(
      deck({ main: POOL.slice(0, 23), side: [POOL[0]], basics: { Plains: 17 } }),
      POOL,
    );
    expect(got.problems).toContainEqual({ kind: "in-both", card: POOL[0] });
    expect(got.problems.some((p) => p.kind === "repeated")).toBe(true);
  });

  it("holds the sideboard to five", () => {
    const ok = checkDeck(
      deck({
        main: POOL.slice(0, 20),
        side: POOL.slice(20, 25),
        basics: { Swamp: 20 },
      }),
      POOL,
    );
    expect(ok.ok).toBe(true);
    expect(ok.side).toBe(SIDEBOARD_MAX);

    const big = Array.from({ length: 30 }, (_, i) => `x${i}`);
    const over = checkDeck(
      deck({ main: big.slice(0, 24), side: big.slice(24, 30), basics: { Swamp: 16 } }),
      big,
    );
    expect(over.problems).toContainEqual({
      kind: "sideboard-too-big",
      have: 6,
      max: SIDEBOARD_MAX,
    });
  });

  it("knows the six basics and nothing else", () => {
    for (const name of BASICS)
      expect(
        checkDeck(deck({ main: POOL.slice(0, 20), basics: { [name]: 20 } }), POOL)
          .ok,
      ).toBe(true);

    const got = checkDeck(
      deck({ main: POOL.slice(0, 23), basics: odd({ Forest: 17, Wastelands: 3 }) }),
      POOL,
    );
    expect(got.problems).toContainEqual({
      kind: "unknown-basic",
      name: "Wastelands",
    });
    /* The bad entry is not counted, so the total is the real one. */
    expect(got.basics).toBe(17);
  });

  it("refuses a basic count that is not a sensible number", () => {
    for (const count of [-1, 2.5, 1000]) {
      const got = checkDeck(
        deck({ main: POOL.slice(0, 23), basics: { Forest: count } }),
        POOL,
      );
      expect(got.problems, String(count)).toContainEqual({
        kind: "bad-basic-count",
        name: "Forest",
      });
    }
  });

  it("collects every problem rather than stopping at the first", () => {
    const got = checkDeck(
      deck({ main: ["nope", "nope"], side: ["nope"], basics: odd({ Woods: 1 }) }),
      POOL,
    );
    expect(got.ok).toBe(false);
    expect(new Set(got.problems.map((p) => p.kind))).toEqual(
      new Set(["not-yours", "repeated", "in-both", "unknown-basic", "too-small"]),
    );
  });

  it("has words for every problem it can report", () => {
    const got = checkDeck(
      deck({
        main: ["nope", "nope"],
        side: ["nope"],
        basics: odd({ Woods: 1, Forest: -2 }),
      }),
      POOL,
    );
    const said = got.problems.map(problemText);
    expect(said.every((t) => t.length > 10)).toBe(true);
    expect(said.join(" ")).toContain("Woods is not a basic land");
    expect(problemText({ kind: "too-small", have: 37, need: 40 })).toContain(
      "add 3 more",
    );
  });

  it("reads a pool off what a seat took", () => {
    expect(
      poolOf([
        { card: "a", packId: "r1-s0", round: 1, at: 1 },
        { card: "b", packId: "r1-s1", round: 1, at: 4 },
      ]),
    ).toEqual(["a", "b"]);
    expect(emptyDeck()).toEqual({ main: [], side: [], basics: {} });
  });
});

/* ------------------------------------------------------------ handing in */

const NEW = { maxSeats: 2, rounds: 1, picksPerTurn: 1, pass: ["right"] };

/** A finished two-player draft, each seat holding 25 cards. */
async function built(store: MemoryStore) {
  const made = await createRoom(store, NEW);
  if (!made.ok) throw new Error(made.reason);
  const keys: Record<string, string> = {};
  for (const name of ["Ada", "Bram"]) {
    const joined = await joinRoom(store, made.code, name);
    if (!joined.ok) throw new Error(joined.reason);
    keys[name] = joined.playerKey;
  }
  const packs = [0, 1].map((p) =>
    Array.from({ length: 25 }, (_, i) => ({
      id: `scryfall-${p}-${i}`,
      finish: "nonfoil",
    })),
  );
  const started = await startDraft(
    store,
    made.code,
    made.adminKey,
    packs,
    seededRng(5),
  );
  if (!started.ok) throw new Error(started.reason);

  const players = await store.listPlayers(made.code);
  const { seats } = (await store.getDraft(made.code))!;
  const keyAt = new Map(players.map((p) => [seats[p.id], keys[p.name]]));

  for (let guard = 0; guard < 200; guard++) {
    const row = (await store.getDraft(made.code))!;
    if (row.phase !== "drafting") break;
    const pack = row.state!.packs.find(
      (p) =>
        p.holder !== null &&
        p.remaining.length > 0 &&
        queueFor(row.state!, p.holder)[0].id === p.id,
    )!;
    const res = await makePick(
      store,
      made.code,
      keyAt.get(pack.holder!)!,
      pack.id,
      [pack.remaining[0]],
    );
    if (!res.ok) throw new Error(res.reason);
  }

  const mine = await readRoom(store, made.code, keys.Ada);
  if (!mine.ok) throw new Error(mine.reason);
  return {
    code: made.code,
    adminKey: made.adminKey,
    keys,
    players,
    pool: mine.view.you!.drafted.map((c) => c.key),
  };
}

describe("saving and submitting", () => {
  it("saves a half-built deck without complaining about it", async () => {
    const store = new MemoryStore();
    const room = await built(store);

    const res = await saveDeck(store, room.code, room.keys.Ada, {
      deck: deck({ main: room.pool.slice(0, 3) }),
    });
    if (!res.ok) throw new Error(`${res.reason} ${res.detail}`);
    expect(res.submitted).toBe(false);
    /* It says what is wrong with it; it just does not refuse it. */
    expect(res.check.ok).toBe(false);
    expect(res.check.total).toBe(3);

    const back = await readRoom(store, room.code, room.keys.Ada);
    if (!back.ok) throw new Error(back.reason);
    expect(back.view.deck?.main).toHaveLength(3);
    expect(back.view.submitted).toBe(false);
  });

  it("takes a finished one and marks it handed in", async () => {
    const store = new MemoryStore();
    const room = await built(store);

    const res = await saveDeck(store, room.code, room.keys.Ada, {
      deck: legal(room.pool),
      submit: true,
    });
    if (!res.ok) throw new Error(`${res.reason} ${res.detail}`);
    expect(res).toMatchObject({ submitted: true, check: { ok: true } });

    const back = await readRoom(store, room.code, room.keys.Ada);
    if (!back.ok) throw new Error(back.reason);
    expect(back.view.submitted).toBe(true);

    /* And everybody can see who is done without seeing what they built. */
    const guest = await readRoom(store, room.code, null);
    if (!guest.ok) throw new Error(guest.reason);
    expect(guest.view.roster.map((p) => p.submitted).sort()).toEqual([
      false,
      true,
    ]);
    expect(JSON.stringify(guest.view)).not.toContain(room.pool[0]);
    /* And a guest is not told the ids the admin needs to hand decks back. */
    expect(guest.view.roster.every((p) => p.id === undefined)).toBe(true);

    const boss = await readRoom(store, room.code, room.adminKey);
    if (!boss.ok) throw new Error(boss.reason);
    expect(boss.view.roster.every((p) => typeof p.id === "string")).toBe(true);
  });

  it("refuses to take an illegal one, and says why", async () => {
    const store = new MemoryStore();
    const room = await built(store);

    const res = await saveDeck(store, room.code, room.keys.Ada, {
      deck: deck({ main: room.pool.slice(0, 3) }),
      submit: true,
    });
    expect(res).toMatchObject({ ok: false, reason: "bad-deck" });
    if (!res.ok) expect(res.detail).toContain("add 37 more");

    const back = await readRoom(store, room.code, room.keys.Ada);
    if (!back.ok) throw new Error(back.reason);
    expect(back.view.deck).toBeNull();
  });

  it("refuses a deck holding somebody else's cards", async () => {
    const store = new MemoryStore();
    const room = await built(store);
    const theirs = await readRoom(store, room.code, room.keys.Bram);
    if (!theirs.ok) throw new Error(theirs.reason);

    const res = await saveDeck(store, room.code, room.keys.Ada, {
      deck: deck({
        main: theirs.view.you!.drafted.map((c) => c.key).slice(0, 23),
        basics: { Forest: 17 },
      }),
      submit: true,
    });
    expect(res).toMatchObject({ ok: false, reason: "bad-deck" });
  });

  it("takes a deck back off the pile when it is edited", async () => {
    const store = new MemoryStore();
    const room = await built(store);
    await saveDeck(store, room.code, room.keys.Ada, {
      deck: legal(room.pool),
      submit: true,
    });

    /*
     * The alternative is a deck the admin has already printed changing
     * underneath them, which is worse than having to press submit again.
     */
    const again = await saveDeck(store, room.code, room.keys.Ada, {
      deck: deck({ main: room.pool.slice(0, 5) }),
    });
    expect(again.ok).toBe(true);

    const back = await readRoom(store, room.code, room.keys.Ada);
    if (!back.ok) throw new Error(back.reason);
    expect(back.view.submitted).toBe(false);
    expect(back.view.deck?.main).toHaveLength(5);
  });

  it("refuses anything that is not a deck", async () => {
    const store = new MemoryStore();
    const room = await built(store);
    for (const body of [
      {},
      { deck: null },
      { deck: "a deck" },
      { deck: { main: "no", side: [], basics: {} } },
      { deck: { main: [1, 2], side: [], basics: {} } },
      { deck: { main: [], side: [], basics: { Forest: "lots" } } },
      { deck: { main: [], side: [], basics: [] } },
    ]) {
      const res = await saveDeck(store, room.code, room.keys.Ada, body);
      expect(res, JSON.stringify(body)).toMatchObject({
        ok: false,
        reason: "bad-deck",
      });
    }
  });

  it("will not take a deck from somebody who is not in the draft", async () => {
    const store = new MemoryStore();
    const room = await built(store);
    for (const key of [null, "not-a-key", room.adminKey]) {
      const res = await saveDeck(store, room.code, key, {
        deck: legal(room.pool),
        submit: true,
      });
      expect(res).toMatchObject({ ok: false, reason: "not-a-player" });
    }
  });

  it("will not take one while the draft is still going", async () => {
    const store = new MemoryStore();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);
    const ada = await joinRoom(store, made.code, "Ada");
    if (!ada.ok) throw new Error(ada.reason);

    expect(
      await saveDeck(store, made.code, ada.playerKey, { deck: emptyDeck() }),
    ).toMatchObject({ ok: false, reason: "wrong-phase" });
  });
});

describe("unlocking a deck", () => {
  it("lets the admin hand one back, keeping what was built", async () => {
    const store = new MemoryStore();
    const room = await built(store);
    await saveDeck(store, room.code, room.keys.Ada, {
      deck: legal(room.pool),
      submit: true,
    });
    const ada = room.players.find((p) => p.name === "Ada")!;

    const res = await unlockDeck(store, room.code, room.adminKey, ada.id);
    expect(res).toMatchObject({ ok: true, name: "Ada" });

    const back = await readRoom(store, room.code, room.keys.Ada);
    if (!back.ok) throw new Error(back.reason);
    expect(back.view.submitted).toBe(false);
    /* Handed back, not thrown away. */
    expect(back.view.deck?.main).toHaveLength(23);
  });

  it("is the admin's alone, and needs a real player", async () => {
    const store = new MemoryStore();
    const room = await built(store);
    const ada = room.players.find((p) => p.name === "Ada")!;

    expect(
      await unlockDeck(store, room.code, room.keys.Bram, ada.id),
    ).toMatchObject({ ok: false, reason: "not-admin" });
    expect(
      await unlockDeck(store, room.code, room.adminKey, "nobody"),
    ).toMatchObject({ ok: false, reason: "not-a-player" });
    expect(
      await unlockDeck(store, room.code, room.adminKey, 7),
    ).toMatchObject({ ok: false, reason: "bad-deck" });
  });
});
