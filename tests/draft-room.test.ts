/*
 * A room, from making one to a finished draft.
 *
 * Driven through the operations against `MemoryStore`, which honours the same
 * conditional writes Postgres will: the point of the port is that the race
 * conditions are testable, so the ones that matter are tested here — a code
 * already taken, two people after the last seat, a pick computed against a
 * draft that has since moved on.
 *
 * The long one at the bottom plays a whole draft through `makePick`. That is
 * the only place the engine, the view, the keys and the store are all exercised
 * together, and it is what makes the server done rather than written.
 */
import { describe, expect, it } from "vitest";

import { SHAPE } from "@/lib/room";
import {
  ALPHABET,
  createRoom,
  hashKey,
  joinRoom,
  makePick,
  newSeatKey,
  parseNewRoom,
  prettyCode,
  readRoom,
  roomCode,
  saveDeck,
  secretKey,
  startDraft,
  tidyCode,
} from "@/lib/room";
import type { Bytes } from "@/lib/room";

import { seededRng } from "./fixtures";
import { MemoryStore } from "./memory-store";

const NEW = { maxSeats: 4, rounds: 2, picksPerTurn: 1, pass: ["right", "left"] };
const FOUR = ["Ada", "Bram", "Cleo", "Dev"];

/** The packs an admin's browser would upload, after generating them. */
const packsFor = (seats: number, rounds: number, size = 4) =>
  Array.from({ length: seats * rounds }, (_, i) =>
    Array.from({ length: size }, (_, j) => ({
      id: `scryfall-${i}-${j}`,
      finish: "nonfoil",
    })),
  );

interface Room {
  code: string;
  adminKey: string;
  keys: Record<string, string>;
}

const open = async (
  store: MemoryStore,
  names: readonly string[],
  over: object = {},
): Promise<Room> => {
  const made = await createRoom(store, { ...NEW, ...over });
  if (!made.ok) throw new Error(made.reason);
  const keys: Record<string, string> = {};
  for (const name of names) {
    const joined = await joinRoom(store, made.code, name);
    if (!joined.ok) throw new Error(joined.reason);
    keys[name] = joined.playerKey;
  }
  return { code: made.code, adminKey: made.adminKey, keys };
};

const dealt = async (
  store: MemoryStore,
  names: readonly string[],
  over: { rounds?: number; picksPerTurn?: number } = {},
  size = 4,
): Promise<Room> => {
  const room = await open(store, names, over);
  const rounds = over.rounds ?? NEW.rounds;
  const res = await startDraft(
    store,
    room.code,
    room.adminKey,
    packsFor(names.length, rounds, size),
    seededRng(3),
  );
  if (!res.ok) throw new Error(`${res.reason} ${res.detail ?? ""}`);
  return room;
};

/**
 * A player's id, read the way the admin's browser reads it.
 *
 * Ids reach a client through `readRoom`'s roster and only for the admin, so
 * taking them from there rather than from the store is the path the real
 * caller uses.
 */
const rosterId = (
  read: Awaited<ReturnType<typeof readRoom>>,
  name: string,
): string => {
  if (!read.ok) throw new Error(read.reason);
  const found = read.view.roster.find((p) => p.name === name);
  if (!found?.id) throw new Error(`no id for ${name}`);
  return found.id;
};

/** Play the whole draft, one legal pick at a time, however it falls out. */
async function playOut(store: MemoryStore, room: Room): Promise<void> {
  const { seats } = (await store.getDraft(room.code))!;
  const players = await store.listPlayers(room.code);
  const keyAt = new Map(
    players.map((p) => [seats[p.id], room.keys[p.name]] as const),
  );

  for (let guard = 0; guard < 4000; guard++) {
    const row = await store.getDraft(room.code);
    if (!row?.state || row.phase !== "drafting") return;
    const pack = row.state.packs.find(
      (p) => p.holder !== null && p.remaining.length > 0,
    );
    if (!pack) throw new Error("nothing to pick, but still drafting");
    const take = Math.min(row.state.rules.picksPerTurn, pack.remaining.length);
    const res = await makePick(
      store,
      room.code,
      keyAt.get(pack.holder!)!,
      pack.id,
      pack.remaining.slice(0, take),
    );
    if (!res.ok) throw new Error(`${res.reason} ${res.detail ?? ""}`);
  }
  throw new Error("the draft did not finish");
}

/* ---------------------------------------------------------------- codes */

describe("codes and keys", () => {
  it("draws a code from an alphabet with nothing ambiguous in it", () => {
    expect(ALPHABET).toHaveLength(32);
    expect(new Set(ALPHABET).size).toBe(32);
    for (const ch of "ILOU") expect(ALPHABET).not.toContain(ch);
    expect(roomCode()).toMatch(new RegExp(`^[${ALPHABET}]{6}$`));
  });

  it("reads back a code somebody mistyped the way Crockford says to", () => {
    expect(tidyCode(" k7m-q2f ")).toBe("K7MQ2F");
    /* I and L are a 1, O is a 0 — the three people get wrong reading aloud. */
    expect(tidyCode("ILO123")).toBe("110123");
    expect(prettyCode("K7MQ2F")).toBe("K7M-Q2F");
  });

  it("hashes a key to something that is not the key", async () => {
    const key = secretKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    const hash = await hashKey(key);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(key);
    expect(await hashKey(key)).toBe(hash);
    expect(await hashKey(secretKey())).not.toBe(hash);
  });
});

/* --------------------------------------------------------------- making */

describe("making a room", () => {
  it("refuses rules nobody could draft", async () => {
    const store = new MemoryStore();
    const bad = [
      { ...NEW, maxSeats: 1 },
      { ...NEW, maxSeats: 13 },
      { ...NEW, maxSeats: 4.5 },
      { ...NEW, rounds: 0 },
      { ...NEW, rounds: 7 },
      { ...NEW, picksPerTurn: 3 },
      { ...NEW, pass: [] },
      { ...NEW, pass: ["sideways"] },
      {},
    ];
    for (const body of bad) {
      const res = await createRoom(store, body);
      expect(res.ok, JSON.stringify(body)).toBe(false);
      if (!res.ok) expect(res.reason).toBe("bad-rules");
    }
    expect(parseNewRoom(NEW).ok).toBe(true);
  });

  it("starts in setup, with the cap as a provisional seat count", async () => {
    const store = new MemoryStore();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);

    const row = (await store.getDraft(made.code))!;
    expect(row.phase).toBe("setup");
    expect(row.shape).toBe(SHAPE);
    expect(row.rev).toBe(0);
    expect(row.state).toBeNull();
    expect(row.pool).toEqual({});
    expect(row.maxSeats).toBe(4);
    expect(row.rules.seats).toBe(4);
    /* The key is never stored, only its hash. */
    expect(row.adminHash).toBe(await hashKey(made.adminKey));
    expect(JSON.stringify(row)).not.toContain(made.adminKey);
  });

  it("draws another code when the first is taken", async () => {
    const store = new MemoryStore();
    /*
     * Bytes that repeat once and then move on, so the first code collides with
     * the room already there and the second does not.
     */
    let call = 0;
    const bytes: Bytes = (n) => {
      const v = call++ < 2 ? 7 : 11;
      return new Uint8Array(n).fill(v);
    };
    const first = await createRoom(store, NEW, { bytes });
    const second = await createRoom(store, NEW, { bytes });
    if (!first.ok || !second.ok) throw new Error("both should be made");
    expect(second.code).not.toBe(first.code);
    expect(store.drafts.size).toBe(2);
  });
});

/* -------------------------------------------------------------- joining */

describe("joining", () => {
  it("lets people in up to the cap and no further", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR);
    expect((await store.listPlayers(room.code)).map((p) => p.name)).toEqual(
      FOUR,
    );
    const fifth = await joinRoom(store, room.code, "Eve");
    expect(fifth).toMatchObject({ ok: false, reason: "room-full" });
  });

  it("will not have two of the same name, however it is typed", async () => {
    const store = new MemoryStore();
    const room = await open(store, ["Ada"]);
    expect(await joinRoom(store, room.code, "ada")).toMatchObject({
      ok: false,
      reason: "name-taken",
    });
  });

  it("tidies a name and refuses an empty or absurd one", async () => {
    const store = new MemoryStore();
    const room = await open(store, []);
    const joined = await joinRoom(store, room.code, "  Ada   Lovelace ");
    expect(joined).toMatchObject({ ok: true, name: "Ada Lovelace" });
    for (const name of ["", "   ", 42, null, "x".repeat(41)]) {
      const res = await joinRoom(store, room.code, name);
      expect(res).toMatchObject({ ok: false, reason: "bad-name" });
    }
  });

  it("gives every player a different key, stored only as a hash", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR);
    const keys = Object.values(room.keys);
    expect(new Set(keys).size).toBe(4);

    const rows = await store.listPlayers(room.code);
    expect(new Set(rows.map((p) => p.keyHash)).size).toBe(4);
    for (const key of keys)
      expect(JSON.stringify(rows)).not.toContain(key);
  });

  it("is closed once the draft has been dealt", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2));
    expect(await joinRoom(store, room.code, "Cleo")).toMatchObject({
      ok: false,
      reason: "wrong-phase",
    });
  });

  it("knows nothing of a room that is not there", async () => {
    const store = new MemoryStore();
    expect(await joinRoom(store, "ZZZZZZ", "Ada")).toMatchObject({
      ok: false,
      reason: "no-such-room",
    });
  });
});

/* -------------------------------------------------------------- dealing */

describe("dealing", () => {
  it("seats the turnout, not the cap, and opens round one", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR.slice(0, 3));
    const res = await startDraft(
      store,
      room.code,
      room.adminKey,
      packsFor(3, 2),
      seededRng(3),
    );
    if (!res.ok) throw new Error(res.reason);

    const row = (await store.getDraft(room.code))!;
    expect(row.phase).toBe("drafting");
    expect(row.rules.seats).toBe(3);
    expect(row.maxSeats).toBe(4);
    expect(row.rev).toBe(1);
    expect(row.state!.packs).toHaveLength(6);
    expect(Object.keys(row.pool)).toHaveLength(24);

    /* A permutation of the seats: everybody sat down, nobody twice. */
    const players = await store.listPlayers(room.code);
    expect(Object.keys(row.seats).sort()).toEqual(
      players.map((p) => p.id).sort(),
    );
    expect(Object.values(row.seats).sort()).toEqual([0, 1, 2]);
  });

  it("will not deal for anybody but the admin", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR);
    for (const key of [room.keys.Ada, secretKey(), ""]) {
      const res = await startDraft(
        store,
        room.code,
        key,
        packsFor(4, 2),
        seededRng(1),
      );
      expect(res).toMatchObject({ ok: false, reason: "not-admin" });
    }
  });

  it("needs two players", async () => {
    const store = new MemoryStore();
    const room = await open(store, ["Ada"]);
    expect(
      await startDraft(store, room.code, room.adminKey, packsFor(1, 2)),
    ).toMatchObject({ ok: false, reason: "not-enough-players" });
  });

  it("refuses a pool that does not match the table", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR);
    const bad: unknown[] = [
      packsFor(4, 1),
      packsFor(5, 2),
      "not a pool",
      [...packsFor(4, 2).slice(1), []],
      [...packsFor(4, 2).slice(1), [{ finish: "nonfoil" }]],
      [...packsFor(4, 2).slice(1), [{ id: "x" }]],
    ];
    for (const packs of bad) {
      const res = await startDraft(store, room.code, room.adminKey, packs);
      expect(res.ok, JSON.stringify(packs).slice(0, 40)).toBe(false);
      if (!res.ok) expect(res.reason).toBe("bad-pool");
    }
    /* Nothing was written while all of that was refused. */
    expect((await store.getDraft(room.code))!.phase).toBe("setup");
  });

  it("leaves nobody seated if the deal loses its race", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR);
    store.loseNextWrite = true;
    const res = await startDraft(
      store,
      room.code,
      room.adminKey,
      packsFor(4, 2),
      seededRng(1),
    );
    expect(res).toMatchObject({ ok: false, reason: "lost-race" });

    const row = (await store.getDraft(room.code))!;
    expect(row.phase).toBe("setup");
    expect(row.state).toBeNull();
    expect(row.seats).toEqual({});
  });

  it("cannot be dealt twice", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    expect(
      await startDraft(store, room.code, room.adminKey, packsFor(4, 2)),
    ).toMatchObject({ ok: false, reason: "wrong-phase" });
  });
});

/* ------------------------------------------------- how the pool was made */

describe("the pool summary", () => {
  const SUMMARY = {
    setCode: "neo",
    mode: "play",
    packs: 8,
    vanilla: false,
    changes: ["Slot 7 (Wildcard): mythic added at 5.0%"],
  };

  const dealWith = async (store: MemoryStore, summary: unknown) => {
    const room = await open(store, FOUR);
    const res = await startDraft(
      store,
      room.code,
      room.adminKey,
      packsFor(4, 2),
      seededRng(1),
      summary,
    );
    if (!res.ok) throw new Error(`${res.reason} ${res.detail ?? ""}`);
    return room;
  };

  it("reaches everybody, because everybody is drafting it", async () => {
    const store = new MemoryStore();
    const room = await dealWith(store, SUMMARY);

    for (const key of [room.keys.Ada, room.adminKey, null]) {
      const res = await readRoom(store, room.code, key);
      if (!res.ok) throw new Error(res.reason);
      expect(res.view.summary).toEqual({ ...SUMMARY, setCode: "NEO" });
    }
  });

  it("is nothing when the page did not say, rather than a refusal", async () => {
    /*
     * A draft that deals is worth more than one that refuses over a caption,
     * and a room made before summaries existed has none either.
     */
    const store = new MemoryStore();
    const room = await dealWith(store, undefined);
    const res = await readRoom(store, room.code, room.keys.Ada);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view.summary).toBeNull();
    expect((await store.getDraft(room.code))!.phase).toBe("drafting");
  });

  it("refuses to store nonsense, and still deals", async () => {
    for (const bad of [null, "a summary", 42, {}, { setCode: "" }, []]) {
      const store = new MemoryStore();
      const room = await dealWith(store, bad);
      const res = await readRoom(store, room.code, room.keys.Ada);
      if (!res.ok) throw new Error(res.reason);
      expect(res.view.summary, JSON.stringify(bad)).toBeNull();
      expect((await store.getDraft(room.code))!.state).not.toBeNull();
    }
  });

  it("bounds what it will keep", async () => {
    const store = new MemoryStore();
    const room = await dealWith(store, {
      setCode: "x".repeat(40),
      mode: "y".repeat(40),
      packs: -3,
      vanilla: "yes",
      changes: [
        ...Array.from({ length: 200 }, (_, i) => `change ${i}`),
        "z".repeat(2000),
        "",
        7,
      ],
    });
    const res = await readRoom(store, room.code, room.keys.Ada);
    if (!res.ok) throw new Error(res.reason);
    const got = res.view.summary!;

    expect(got.setCode).toHaveLength(10);
    expect(got.mode).toHaveLength(20);
    /* A negative pack count is not a pack count. */
    expect(got.packs).toBe(0);
    /* `vanilla` is a flag, and only `true` is true. */
    expect(got.vanilla).toBe(false);
    expect(got.changes).toHaveLength(80);
    expect(got.changes.every((c) => c.length <= 500)).toBe(true);
    expect(got.changes).not.toContain("");
  });

  it("says plainly that a vanilla draft has no changes", async () => {
    const store = new MemoryStore();
    const room = await dealWith(store, {
      setCode: "DSK",
      mode: "play",
      packs: 8,
      vanilla: true,
      changes: [],
    });
    const res = await readRoom(store, room.code, null);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view.summary).toMatchObject({ vanilla: true, changes: [] });
  });
});

/* -------------------------------------------------------------- picking */

describe("picking", () => {
  const first = async (store: MemoryStore, room: Room) => {
    const row = (await store.getDraft(room.code))!;
    const players = await store.listPlayers(room.code);
    const pack = row.state!.packs.find((p) => p.holder !== null)!;
    const player = players.find((p) => row.seats[p.id] === pack.holder)!;
    return { pack, key: room.keys[player.name], players };
  };

  it("takes a card, logs it, and leaves the draft one pick on", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const { pack, key } = await first(store, room);
    const card = pack.remaining[0];

    const res = await makePick(store, room.code, key, pack.id, [card]);
    if (!res.ok) throw new Error(res.reason);
    expect(res.taken.map((t) => t.card)).toEqual([card]);
    expect(res.over).toBe(false);

    const row = (await store.getDraft(room.code))!;
    expect(row.rev).toBe(2);
    expect(row.state!.clock).toBe(1);
    expect(store.picks).toEqual([
      { code: room.code, at: 1, seat: pack.holder, packId: pack.id, cards: [card] },
    ]);
  });

  it("stands even if its log row cannot be written", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const { pack, key } = await first(store, room);
    store.breakLog = true;

    const res = await makePick(store, room.code, key, pack.id, [
      pack.remaining[0],
    ]);
    expect(res.ok).toBe(true);
    expect(store.picks).toEqual([]);
    expect((await store.getDraft(room.code))!.state!.clock).toBe(1);
  });

  it("refuses somebody who is not in the draft", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const { pack } = await first(store, room);
    for (const key of [null, secretKey(), room.adminKey]) {
      const res = await makePick(store, room.code, key, pack.id, [
        pack.remaining[0],
      ]);
      expect(res).toMatchObject({ ok: false, reason: "not-a-player" });
    }
  });

  it("passes the engine's own refusal straight back", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const row = (await store.getDraft(room.code))!;
    const players = await store.listPlayers(room.code);
    const mine = row.state!.packs.find((p) => p.holder === 0)!;
    const theirs = row.state!.packs.find((p) => p.holder === 1)!;
    const key = room.keys[players.find((p) => row.seats[p.id] === 0)!.name];

    expect(
      await makePick(store, room.code, key, theirs.id, [theirs.remaining[0]]),
    ).toMatchObject({ ok: false, reason: "not-your-pack" });
    expect(
      await makePick(store, room.code, key, "r9-s9", [mine.remaining[0]]),
    ).toMatchObject({ ok: false, reason: "no-such-pack" });
    expect(
      await makePick(store, room.code, key, mine.id, mine.remaining),
    ).toMatchObject({ ok: false, reason: "wrong-count" });
    expect(
      await makePick(store, room.code, key, mine.id, [theirs.remaining[0]]),
    ).toMatchObject({ ok: false, reason: "not-in-pack" });
    /* And none of that moved the draft. */
    expect((await store.getDraft(room.code))!.state!.clock).toBe(0);
  });

  it("says so plainly when another pick got there first", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const { pack, key } = await first(store, room);
    store.loseNextWrite = true;

    const res = await makePick(store, room.code, key, pack.id, [
      pack.remaining[0],
    ]);
    /*
     * Its own reason, not `not-your-pack`: the pick is very likely still
     * legal, so the client re-reads and sends it again rather than telling
     * the player their pack moved on.
     */
    expect(res).toMatchObject({ ok: false, reason: "lost-race" });
    expect((await store.getDraft(room.code))!.state!.clock).toBe(0);
    expect(store.picks).toEqual([]);
  });

  it("refuses a pick before the deal and after the finish", async () => {
    const store = new MemoryStore();
    const setup = await open(store, FOUR);
    expect(
      await makePick(store, setup.code, setup.keys.Ada, "r1-s0", ["x"]),
    ).toMatchObject({ ok: false, reason: "wrong-phase" });

    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 }, 2);
    await playOut(store, room);
    expect(
      await makePick(store, room.code, room.keys.Ada, "r1-s0", ["x"]),
    ).toMatchObject({ ok: false, reason: "wrong-phase" });
  });
});

/* -------------------------------------------------------------- reading */

describe("reading a room", () => {
  it("tells a guest who is in it and nothing else", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const res = await readRoom(store, room.code, null);
    if (!res.ok) throw new Error(res.reason);

    expect(res.view).toMatchObject({ role: "guest", admin: false });
    expect(res.view.you).toBeNull();
    expect(res.view.board).not.toBeNull();
    expect(res.view.roster.map((p) => p.seat)).toEqual([0, 1, 2, 3]);

    const row = (await store.getDraft(room.code))!;
    const json = JSON.stringify(res.view);
    for (const key of Object.keys(row.pool)) expect(json).not.toContain(key);
  });

  it("gives a player their own packs and nobody else's", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const res = await readRoom(store, room.code, room.keys.Cleo);
    if (!res.ok) throw new Error(res.reason);

    expect(res.view).toMatchObject({ role: "player", admin: false });
    expect(res.view.you).not.toBeNull();
    expect(res.view.you!.queue).toHaveLength(1);

    const row = (await store.getDraft(room.code))!;
    const seat = res.view.you!.seat;
    const mine = row.state!.packs.find((p) => p.holder === seat)!;
    expect(res.view.you!.queue[0].cards.map((c) => c.key)).toEqual(
      mine.remaining,
    );
  });

  it("knows an admin who is not playing", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const res = await readRoom(store, room.code, room.adminKey);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view).toMatchObject({ role: "guest", admin: true });
    expect(res.view.you).toBeNull();
  });

  it("knows an admin who is also playing, which is the usual case", async () => {
    /*
     * Playing and running the draft are separate facts rather than one role.
     * Whoever organises a draft is normally in it, and before this was two
     * answers they could not be both: the browser sends a seat key as its
     * identity, so the admin key has to travel beside it rather than instead.
     */
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const res = await readRoom(store, room.code, room.keys.Ada, room.adminKey);
    if (!res.ok) throw new Error(res.reason);

    expect(res.view).toMatchObject({ role: "player", admin: true });
    expect(res.view.you).not.toBeNull();
    /* And so they get the ids that handing a deck back needs. */
    expect(res.view.roster.every((p) => typeof p.id === "string")).toBe(true);
  });

  it("does not take somebody's word for being the admin", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const res = await readRoom(store, room.code, room.keys.Ada, room.keys.Bram);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view).toMatchObject({ role: "player", admin: false });
    expect(res.view.roster.every((p) => p.id === undefined)).toBe(true);
  });

  it("shows a room in setup with no board at all", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR.slice(0, 2));
    const res = await readRoom(store, room.code, room.keys.Ada);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view.phase).toBe("setup");
    expect(res.view.board).toBeNull();
    expect(res.view.you).toBeNull();
    expect(res.view.roster).toEqual([
      { name: "Ada", seat: null, submitted: false },
      { name: "Bram", seat: null, submitted: false },
    ]);
  });

  it("refuses a draft stored at a layout this deploy does not read", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    /* As if a deploy had changed the shape of the state under a live draft. */
    store.drafts.set(room.code, {
      ...store.drafts.get(room.code)!,
      shape: SHAPE + 1,
    });
    const res = await readRoom(store, room.code, room.keys.Ada);
    expect(res).toMatchObject({ ok: false, reason: "stale-shape" });
    if (!res.ok) expect(res.detail).toContain(`reads ${SHAPE}`);
  });

  it("has nothing to say about a room that does not exist", async () => {
    const store = new MemoryStore();
    expect(await readRoom(store, "ZZZZZZ", null)).toMatchObject({
      ok: false,
      reason: "no-such-room",
    });
  });
});

/* ------------------------------------------------------- the whole way */

describe("a draft from end to end", () => {
  it("plays out, finishes, and leaves everyone a full pool", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR, { rounds: 3 }, 5);
    await playOut(store, room);

    const row = (await store.getDraft(room.code))!;
    expect(row.phase).toBe("building");
    expect(row.state!.round).toBe(4);
    expect(row.state!.picked.map((t) => t.length)).toEqual([15, 15, 15, 15]);

    /* Every card in the pool went to exactly one seat. */
    const drafted = row.state!.picked.flat().map((t) => t.card);
    expect(drafted).toHaveLength(60);
    expect(new Set(drafted).size).toBe(60);
    expect([...drafted].sort()).toEqual(Object.keys(row.pool).sort());

    /* And the log can rebuild it: one row a pick, clocks 1..60, no gaps. */
    expect(store.picks).toHaveLength(60);
    expect(store.picks.map((p) => p.at)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 1),
    );
    expect(store.picks.flatMap((p) => p.cards).sort()).toEqual(
      Object.keys(row.pool).sort(),
    );
  });

  it("plays out with two picks a turn as well", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR, { rounds: 2, picksPerTurn: 2 }, 7);
    await playOut(store, room);

    const row = (await store.getDraft(room.code))!;
    expect(row.phase).toBe("building");
    expect(row.state!.picked.flat()).toHaveLength(56);
    expect(store.picks.flatMap((p) => p.cards)).toHaveLength(56);
  });

  it("ends with a view that says it is over and nobody is waiting", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 }, 4);
    await playOut(store, room);

    const res = await readRoom(store, room.code, room.keys.Ada);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view.phase).toBe("building");
    expect(res.view.board!.over).toBe(true);
    expect(res.view.board!.waitingOn).toEqual([]);
    expect(res.view.you!.queue).toEqual([]);
    expect(res.view.you!.drafted).toHaveLength(4);
    expect(res.view.board!.seats.map((s) => s.drafted)).toEqual([4, 4]);
  });
});

/* ---------------------------------------------------------- a lost link */

describe("a new seat key", () => {
  /*
   * The only recovery there is. A key is stored as a hash, so nobody can be
   * shown theirs — the admin mints a replacement and passes it on.
   */
  it("replaces the key, and the old one stops working", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 });

    const was = room.keys.Ada;
    const made = await newSeatKey(store, room.code, room.adminKey, rosterId(
      await readRoom(store, room.code, null, room.adminKey),
      "Ada",
    ));
    if (!made.ok) throw new Error(made.reason);
    expect(made.name).toBe("Ada");
    expect(made.playerKey).not.toBe(was);

    /* The new key is the seat. */
    const now = await readRoom(store, room.code, made.playerKey);
    if (!now.ok) throw new Error(now.reason);
    expect(now.view.role).toBe("player");
    expect(now.view.you).not.toBeNull();

    /* The old one is nobody. */
    const before = await readRoom(store, room.code, was);
    if (!before.ok) throw new Error(before.reason);
    expect(before.view.role).toBe("guest");
    expect(before.view.you).toBeNull();
  });

  it("keeps everything the seat has drafted", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 });

    /* Take a card, so the seat has something to lose. */
    const first = await readRoom(store, room.code, room.keys.Ada);
    if (!first.ok) throw new Error(first.reason);
    const pack = first.view.you!.queue[0];
    const took = await makePick(store, room.code, room.keys.Ada, pack.id, [
      pack.cards[0].key,
    ]);
    if (!took.ok) throw new Error(took.reason);

    const id = rosterId(
      await readRoom(store, room.code, null, room.adminKey),
      "Ada",
    );
    const made = await newSeatKey(store, room.code, room.adminKey, id);
    if (!made.ok) throw new Error(made.reason);

    const after = await readRoom(store, room.code, made.playerKey);
    if (!after.ok) throw new Error(after.reason);
    expect(after.view.you!.drafted).toHaveLength(1);
    expect(after.view.you!.drafted[0].key).toBe(pack.cards[0].key);
  });

  it("does not disturb a deck that was already saved", async () => {
    /*
     * `putSeatKey` reads the row and writes it back, so this is the thing
     * that would break if it ever wrote a `PlayerRow` the caller supplied.
     */
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 });
    await playOut(store, room);

    const view = await readRoom(store, room.code, room.keys.Ada);
    if (!view.ok) throw new Error(view.reason);
    const mine = view.view.you!.drafted.map((c) => c.key);
    const saved = await saveDeck(store, room.code, room.keys.Ada, {
      deck: { main: mine, side: [], basics: { Forest: 10 } },
      submit: false,
    });
    if (!saved.ok) throw new Error(saved.reason);

    const id = rosterId(
      await readRoom(store, room.code, null, room.adminKey),
      "Ada",
    );
    const made = await newSeatKey(store, room.code, room.adminKey, id);
    if (!made.ok) throw new Error(made.reason);

    const after = await readRoom(store, room.code, made.playerKey);
    if (!after.ok) throw new Error(after.reason);
    expect(after.view.deck).toEqual({
      main: mine,
      side: [],
      basics: { Forest: 10 },
    });
  });

  it("works before the deal and after the draft is over", async () => {
    const store = new MemoryStore();
    const room = await open(store, FOUR.slice(0, 2));
    const atSetup = rosterId(
      await readRoom(store, room.code, null, room.adminKey),
      "Bram",
    );
    expect(
      (await newSeatKey(store, room.code, room.adminKey, atSetup)).ok,
    ).toBe(true);

    const played = new MemoryStore();
    const over = await dealt(played, FOUR.slice(0, 2), { rounds: 1 });
    await playOut(played, over);
    const atEnd = rosterId(
      await readRoom(played, over.code, null, over.adminKey),
      "Bram",
    );
    expect((await newSeatKey(played, over.code, over.adminKey, atEnd)).ok).toBe(
      true,
    );
  });

  it("is the admin's alone, and needs a player who exists", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 });
    const id = rosterId(
      await readRoom(store, room.code, null, room.adminKey),
      "Ada",
    );

    /* A player's own key does not run the room, even for their own seat. */
    const asPlayer = await newSeatKey(store, room.code, room.keys.Ada, id);
    expect(asPlayer.ok).toBe(false);
    if (!asPlayer.ok) expect(asPlayer.reason).toBe("not-admin");

    const nobody = await newSeatKey(store, room.code, room.adminKey, "nope");
    expect(nobody.ok).toBe(false);
    if (!nobody.ok) expect(nobody.reason).toBe("not-a-player");

    /* Not a string at all, which is what a hand-written request sends. */
    const junk = await newSeatKey(store, room.code, room.adminKey, 7);
    expect(junk.ok).toBe(false);
    if (!junk.ok) expect(junk.reason).toBe("not-a-player");

    const gone = await newSeatKey(store, "ZZZZZZ", room.adminKey, id);
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.reason).toBe("no-such-room");
  });

  it("gives a different key every time it is asked", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR.slice(0, 2), { rounds: 1 });
    const id = rosterId(
      await readRoom(store, room.code, null, room.adminKey),
      "Ada",
    );

    const one = await newSeatKey(store, room.code, room.adminKey, id);
    const two = await newSeatKey(store, room.code, room.adminKey, id);
    if (!one.ok || !two.ok) throw new Error("refused");
    expect(one.playerKey).not.toBe(two.playerKey);

    /* And only the newest works — minting again retires the one before. */
    const old = await readRoom(store, room.code, one.playerKey);
    if (!old.ok) throw new Error(old.reason);
    expect(old.view.role).toBe("guest");
  });
});
