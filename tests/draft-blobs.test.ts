/*
 * The draft on object storage.
 *
 * `tests/draft-room.test.ts` drives the same operations against a `Map` of
 * rows that behaves like a table. This file drives them against the revision
 * chain, which is a different shape of storage reaching the same contract —
 * so the overlap in the first test is deliberate: the point is that the room
 * works the same way on top of blobs, not that the operations work at all.
 *
 * The rest is what only blobs can get wrong: a key as the lock, slots as the
 * bound on a room, the name tie-break, and a list that lags a write.
 */
import { describe, expect, it } from "vitest";

import {
  blobStore,
  createRoom,
  joinRoom,
  makePick,
  readRoom,
  startDraft,
} from "@/lib/room";
import type { PlayerRow, Store } from "@/lib/room";

import { seededRng } from "./fixtures";
import { MemoryBucket } from "./memory-bucket";

const NEW = { maxSeats: 4, rounds: 2, picksPerTurn: 1, pass: ["right", "left"] };
const FOUR = ["Ada", "Bram", "Cleo", "Dev"];

const packsFor = (seats: number, rounds: number, size = 4) =>
  Array.from({ length: seats * rounds }, (_, i) =>
    Array.from({ length: size }, (_, j) => ({
      id: `scryfall-${i}-${j}`,
      finish: "nonfoil",
    })),
  );

const fresh = () => {
  const bucket = new MemoryBucket();
  return { bucket, store: blobStore(bucket) };
};

const open = async (
  store: Store,
  names: readonly string[],
  over: object = {},
) => {
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

const player = (code: string, name: string): PlayerRow => ({
  code,
  id: `id-${name.toLowerCase()}`,
  name,
  keyHash: `hash-${name.toLowerCase()}`,
  joinedAt: "2026-11-15T00:00:00.000Z",
});

/* ------------------------------------------------------- the same contract */

describe("a draft on blobs", () => {
  it("plays out from making a room to a finished draft", async () => {
    const { store } = fresh();
    const room = await open(store, FOUR);
    const started = await startDraft(
      store,
      room.code,
      room.adminKey,
      packsFor(4, 2, 5),
      seededRng(3),
    );
    if (!started.ok) throw new Error(`${started.reason} ${started.detail}`);

    const { seats } = (await store.getDraft(room.code))!;
    const players = await store.listPlayers(room.code);
    const keyAt = new Map(
      players.map((p) => [seats[p.id], room.keys[p.name]] as const),
    );

    for (let guard = 0; guard < 2000; guard++) {
      const row = (await store.getDraft(room.code))!;
      if (row.phase !== "drafting") break;
      const pack = row.state!.packs.find(
        (p) => p.holder !== null && p.remaining.length > 0,
      )!;
      const take = Math.min(row.state!.rules.picksPerTurn, pack.remaining.length);
      const res = await makePick(
        store,
        room.code,
        keyAt.get(pack.holder!)!,
        pack.id,
        pack.remaining.slice(0, take),
      );
      if (!res.ok) throw new Error(`${res.reason} ${res.detail ?? ""}`);
    }

    const row = (await store.getDraft(room.code))!;
    expect(row.phase).toBe("building");
    expect(row.state!.picked.map((t) => t.length)).toEqual([10, 10, 10, 10]);

    const view = await readRoom(store, room.code, room.keys.Ada);
    if (!view.ok) throw new Error(view.reason);
    expect(view.view.board!.over).toBe(true);
    expect(view.view.you!.drafted).toHaveLength(10);
  });

  it("knows nothing about a room that was never made", async () => {
    const { store } = fresh();
    expect(await store.getDraft("ZZZZZZ")).toBeNull();
    expect(await store.listPlayers("ZZZZZZ")).toEqual([]);
  });
});

/* --------------------------------------------------- what only blobs can do */

describe("the key is the lock", () => {
  it("lets exactly one of two writes from the same revision through", async () => {
    const { store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);

    /* Both computed from revision 0, as two requests in flight would have. */
    const first = await store.putDraft(made.code, 0, { phase: "drafting" });
    const second = await store.putDraft(made.code, 0, { phase: "closed" });
    expect([first, second]).toEqual([true, false]);

    /* And the winner's write is the one that stands. */
    expect((await store.getDraft(made.code))!.phase).toBe("drafting");
    expect((await store.getDraft(made.code))!.rev).toBe(1);
  });

  it("refuses a write from a revision that has already been overtaken", async () => {
    const { store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);
    await store.putDraft(made.code, 0, { phase: "drafting" });
    /* Revision 0 is two behind now; there is no going back to it. */
    expect(await store.putDraft(made.code, 0, { phase: "closed" })).toBe(false);
  });

  it("refuses a second room with the same code", async () => {
    const { store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);
    const row = (await store.getDraft(made.code))!;
    expect(await store.createDraft(row)).toBe(false);
  });

  it("keeps every revision, so the chain is its own second backup", async () => {
    const { bucket, store } = fresh();
    const room = await open(store, FOUR.slice(0, 2));
    const started = await startDraft(
      store,
      room.code,
      room.adminKey,
      packsFor(2, 2, 2),
      seededRng(1),
    );
    if (!started.ok) throw new Error(started.reason);

    const row = (await store.getDraft(room.code))!;
    const revs = bucket.keys(`rooms/${room.code}/rev/`);
    expect(revs).toHaveLength(row.rev + 1);
    expect(revs[0]).toBe(`rooms/${room.code}/rev/0000`);
    /* Numeric order is lexicographic order, which is what the padding buys. */
    expect([...revs].sort()).toEqual(revs);
  });
});

describe("slots bound the room", () => {
  it("fills slots from zero and then says the room is full", async () => {
    const { bucket, store } = fresh();
    const room = await open(store, FOUR);
    expect(bucket.keys(`rooms/${room.code}/seat/`)).toEqual([
      `rooms/${room.code}/seat/0000`,
      `rooms/${room.code}/seat/0001`,
      `rooms/${room.code}/seat/0002`,
      `rooms/${room.code}/seat/0003`,
    ]);
    expect(await joinRoom(store, room.code, "Eve")).toMatchObject({
      ok: false,
      reason: "room-full",
    });
  });

  it("gives a name to the lower slot and makes the higher one withdraw", async () => {
    const { bucket, store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);

    /*
     * Two people called Dev, racing. Neither claim can be conditional on the
     * name, so both get a slot and then both apply the same rule: the lower
     * slot keeps it.
     */
    expect(await store.addPlayer(player(made.code, "Dev"), 4)).toBe("joined");
    const second = { ...player(made.code, "dev"), id: "id-dev-2" };
    expect(await store.addPlayer(second, 4)).toBe("name-taken");

    /* The loser gave its slot back, so the room is not short of a seat. */
    expect(bucket.keys(`rooms/${made.code}/seat/`)).toEqual([
      `rooms/${made.code}/seat/0000`,
    ]);
    expect((await store.listPlayers(made.code)).map((p) => p.id)).toEqual([
      "id-dev",
    ]);
    expect(await store.addPlayer(player(made.code, "Ada"), 4)).toBe("joined");
  });
});

describe("a list that lags a write", () => {
  it("still finds the newest revision, by looking for it", async () => {
    const { bucket, store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);
    await store.putDraft(made.code, 0, { phase: "drafting" });
    await store.putDraft(made.code, 1, { phase: "building" });

    /* As if the index had not caught up with the last two writes. */
    bucket.hideFromList.add(`rooms/${made.code}/rev/0001`);
    bucket.hideFromList.add(`rooms/${made.code}/rev/0002`);
    expect(await bucket.list(`rooms/${made.code}/rev/`)).toEqual([
      `rooms/${made.code}/rev/0000`,
    ]);

    const row = (await store.getDraft(made.code))!;
    expect(row.rev).toBe(2);
    expect(row.phase).toBe("building");
  });

  it("finds a room whose only revision is not listed yet", async () => {
    const { bucket, store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);
    bucket.hideFromList.add(`rooms/${made.code}/rev/0000`);
    expect(await bucket.list(`rooms/${made.code}/rev/`)).toEqual([]);
    expect((await store.getDraft(made.code))!.rev).toBe(0);
  });

  it("would have lost a write without that, which is why it is there", async () => {
    /*
     * The failure this prevents, spelled out: read a stale revision, compute
     * from it, and the write lands on a key that already exists. The pick is
     * refused and the player is told somebody beat them to it — by themselves.
     */
    const { bucket, store } = fresh();
    const made = await createRoom(store, NEW);
    if (!made.ok) throw new Error(made.reason);
    await store.putDraft(made.code, 0, { phase: "drafting" });

    bucket.hideFromList.add(`rooms/${made.code}/rev/0001`);
    const stale = (await bucket.list(`rooms/${made.code}/rev/`)).at(-1);
    expect(stale).toBe(`rooms/${made.code}/rev/0000`);
    /* The probe is what makes this 1 rather than 0. */
    expect((await store.getDraft(made.code))!.rev).toBe(1);
  });
});

describe("the pick log", () => {
  it("writes one blob a pick and never writes one twice", async () => {
    const { bucket, store } = fresh();
    const rows = [
      { code: "ABC123", at: 1, seat: 0, packId: "r1-s0", cards: ["p00-c00"] },
    ];
    await store.logPicks(rows);
    await store.logPicks(rows);
    await store.logPicks([{ ...rows[0], cards: ["something-else"] }]);

    expect(bucket.keys("rooms/ABC123/pick/")).toEqual([
      "rooms/ABC123/pick/0001",
    ]);
    expect(await bucket.get("rooms/ABC123/pick/0001")).toEqual(rows[0]);
  });
});
