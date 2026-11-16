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
  parseNewRoom,
  prettyCode,
  readRoom,
  roomCode,
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

    expect(res.view.role).toBe("guest");
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

    expect(res.view.role).toBe("player");
    expect(res.view.you).not.toBeNull();
    expect(res.view.you!.queue).toHaveLength(1);

    const row = (await store.getDraft(room.code))!;
    const seat = res.view.you!.seat;
    const mine = row.state!.packs.find((p) => p.holder === seat)!;
    expect(res.view.you!.queue[0].cards.map((c) => c.key)).toEqual(
      mine.remaining,
    );
  });

  it("knows the admin, who is not playing", async () => {
    const store = new MemoryStore();
    const room = await dealt(store, FOUR);
    const res = await readRoom(store, room.code, room.adminKey);
    if (!res.ok) throw new Error(res.reason);
    expect(res.view.role).toBe("admin");
    expect(res.view.you).toBeNull();
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
      { name: "Ada", seat: null },
      { name: "Bram", seat: null },
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
