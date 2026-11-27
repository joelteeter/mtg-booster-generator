/*
 * The browser's side of the draft: the URL it reads, the key it remembers,
 * and the requests it shapes.
 *
 * There are no rules here to test — they are all in `lib/draft` and
 * `lib/room/ops.ts`, which run in the function. What is worth testing is the
 * plumbing that would be silently wrong: a seat key in the query string
 * instead of the fragment, a header spelled differently from the one the
 * handler reads, a `localStorage` that throws in a private window.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { poolFromRun } from "@/lib/draft-pool";
import type { GeneratedPack } from "@/lib/generate";
import { artById } from "@/lib/preview";
import { gateOpen } from "@/lib/room/codes";
import type { Card } from "@/lib/scryfall/types";
import {
  DraftError,
  joinRoom,
  makeRoom,
  recallAdmin,
  recallSeat,
  rememberAdmin,
  rememberSeat,
  keyLink,
  newSeatKey,
  roomFromUrl,
  roomHref,
  roomLink,
  sendPick,
} from "@/lib/room-client";

const NEW = {
  maxSeats: 8,
  rounds: 3,
  picksPerTurn: 1 as const,
  pass: ["right", "left", "right"] as ("left" | "right")[],
};

/** A `Storage` in a Map, and one that throws the way a locked-down one does. */
const fakeStore = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, v),
  } as Storage;
};

const angryStore = (): Storage =>
  ({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  }) as unknown as Storage;

/* ------------------------------------------------------------------- URLs */

describe("reading a URL", () => {
  it("takes the code from the query and the keys from the fragment", () => {
    expect(roomFromUrl("?room=K7MQ2F", "#s=9f3cab")).toEqual({
      code: "K7MQ2F",
      seatKey: "9f3cab",
      adminKey: null,
    });
  });

  it("reads a seat and an admin key together", () => {
    /*
     * Whoever started the draft may be playing in it, so one browser can hold
     * both. They are separate keys and the function sends both headers.
     */
    expect(roomFromUrl("?room=K7MQ2F", "#s=9f3cab&a=61b2de")).toEqual({
      code: "K7MQ2F",
      seatKey: "9f3cab",
      adminKey: "61b2de",
    });
    expect(roomFromUrl("?room=K7MQ2F", "#a=61b2de")).toEqual({
      code: "K7MQ2F",
      seatKey: null,
      adminKey: "61b2de",
    });
  });

  it("tidies a code somebody typed or pasted badly", () => {
    expect(roomFromUrl("?room=k7m-q2f", "").code).toBe("K7MQ2F");
    /* Crockford's folding, so a code read aloud survives being misheard. */
    expect(roomFromUrl("?room=ilo123", "").code).toBe("110123");
  });

  it("copes with either half missing", () => {
    expect(roomFromUrl("", "")).toEqual({
      code: null,
      seatKey: null,
      adminKey: null,
    });
    expect(roomFromUrl("?room=K7MQ2F", "")).toEqual({
      code: "K7MQ2F",
      seatKey: null,
      adminKey: null,
    });
    /* A key with no room is nothing to act on. */
    expect(roomFromUrl("", "#s=9f3cab").code).toBeNull();
  });

  it("ignores other things in the query and the fragment", () => {
    expect(roomFromUrl("?a=1&room=K7MQ2F&b=2", "#t=x&s=key&u=y")).toEqual({
      code: "K7MQ2F",
      seatKey: "key",
      adminKey: null,
    });
  });

  it("builds a link with the keys after the hash, never before it", () => {
    const link = keyLink("https://example.test", "K7MQ2F", {
      seat: "9f3cab",
      admin: "61b2de",
    });
    expect(link).toBe(
      "https://example.test/draft?room=K7MQ2F#s=9f3cab&a=61b2de",
    );
    /*
     * The point of the whole arrangement: a fragment is not sent to a server,
     * so a key cannot turn up in an access log or a `Referer` header. If one
     * ever appears before the `#`, that stops being true.
     */
    const before = link.split("#")[0];
    expect(before).not.toContain("9f3cab");
    expect(before).not.toContain("61b2de");
  });

  it("leaves out a key it was not given", () => {
    const origin = "https://x.test";
    expect(keyLink(origin, "K7MQ2F", { seat: "abc" })).toBe(
      `${origin}/draft?room=K7MQ2F#s=abc`,
    );
    expect(keyLink(origin, "K7MQ2F", { admin: "def" })).toBe(
      `${origin}/draft?room=K7MQ2F#a=def`,
    );
    /* A null key is a key this browser does not hold, not an empty one. */
    expect(keyLink(origin, "K7MQ2F", { seat: null, admin: null })).toBe(
      `${origin}/draft?room=K7MQ2F`,
    );
    /* The invite is the same builder with nothing to carry — no stray `#`. */
    expect(roomLink(origin, "K7MQ2F")).toBe(`${origin}/draft?room=K7MQ2F`);
    expect(roomHref("K7MQ2F")).toBe("/draft?room=K7MQ2F");
  });

  it("round-trips both keys back through the reader", () => {
    const link = new URL(
      keyLink("https://x.test", "K7MQ2F", {
        seat: "abc123",
        admin: "def456",
      }),
    );
    expect(roomFromUrl(link.search, link.hash)).toEqual({
      code: "K7MQ2F",
      seatKey: "abc123",
      adminKey: "def456",
    });
  });
});

/* ---------------------------------------------------------------- storage */

describe("remembering a seat", () => {
  it("keeps the seat and admin keys apart, per room", () => {
    const store = fakeStore();
    rememberSeat("AAA111", "seat-a", store);
    rememberAdmin("AAA111", "admin-a", store);
    rememberSeat("BBB222", "seat-b", store);

    expect(recallSeat("AAA111", store)).toBe("seat-a");
    expect(recallAdmin("AAA111", store)).toBe("admin-a");
    expect(recallSeat("BBB222", store)).toBe("seat-b");
    expect(recallAdmin("BBB222", store)).toBeNull();
    expect(recallSeat("CCC333", store)).toBeNull();
  });

  it("survives storage that is not there or refuses", () => {
    /*
     * A private window, or site data blocked. The key is a cache and the link
     * is the record, so losing it has to be survivable rather than fatal.
     */
    expect(() => rememberSeat("AAA111", "k", null)).not.toThrow();
    expect(recallSeat("AAA111", null)).toBeNull();

    const angry = angryStore();
    expect(() => rememberSeat("AAA111", "k", angry)).not.toThrow();
    expect(recallSeat("AAA111", angry)).toBeNull();
  });
});

/* --------------------------------------------------------------- requests */

describe("talking to the function", () => {
  afterEach(() => vi.unstubAllGlobals());

  /* Typed as `fetch`, so `mock.calls` carries the real argument types. */
  const answer = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );

  it("posts a new room to the right place, with the password header", async () => {
    const fetchMock = answer({ code: "K7MQ2F", adminKey: "admin-key" });
    vi.stubGlobal("fetch", fetchMock);

    expect(await makeRoom(NEW, "luggage1234")).toEqual({
      code: "K7MQ2F",
      adminKey: "admin-key",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/draft");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("x-draft-password")).toBe(
      "luggage1234",
    );
    expect(JSON.parse(init?.body as string)).toEqual(NEW);
  });

  it("leaves the password header off when there is none", async () => {
    const fetchMock = answer({ code: "K7MQ2F", adminKey: "k" });
    vi.stubGlobal("fetch", fetchMock);
    await makeRoom(NEW);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).has("x-draft-password")).toBe(false);
  });

  it("sends a key as the header the handler reads", async () => {
    const fetchMock = answer({ over: false });
    vi.stubGlobal("fetch", fetchMock);
    await sendPick("K7MQ2F", "seat-key", "r1-s0", ["p00-c00"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/draft/K7MQ2F/pick");
    expect(new Headers(init?.headers).get("x-draft-key")).toBe("seat-key");
    expect(JSON.parse(init?.body as string)).toEqual({
      packId: "r1-s0",
      cards: ["p00-c00"],
    });
  });

  it("asks for a new seat key with the admin header, not the seat one", async () => {
    const fetchMock = answer({ name: "Ada", playerKey: "fresh-key" });
    vi.stubGlobal("fetch", fetchMock);

    expect(await newSeatKey("K7MQ2F", "admin-key", "id-ada")).toEqual({
      name: "Ada",
      playerKey: "fresh-key",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/draft/K7MQ2F/rekey");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-draft-admin-key")).toBe("admin-key");
    /*
     * The seat header would be this browser claiming to be the player whose
     * key is being replaced, which it is not — it is the one handing the new
     * link on.
     */
    expect(headers.has("x-draft-key")).toBe(false);
    expect(JSON.parse(init?.body as string)).toEqual({ playerId: "id-ada" });
  });

  it("turns a refusal into an error carrying the reason", async () => {
    vi.stubGlobal(
      "fetch",
      answer({ error: "name-taken", detail: "already in it" }, 409),
    );
    await expect(joinRoom("K7MQ2F", "Dev")).rejects.toThrowError(DraftError);
    await expect(joinRoom("K7MQ2F", "Dev")).rejects.toMatchObject({
      reason: "name-taken",
      status: 409,
      detail: "already in it",
    });
  });

  it("does not pretend a response with no JSON was fine", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () => new Response("<html>gateway</html>", { status: 502 }),
      ),
    );
    await expect(joinRoom("K7MQ2F", "Dev")).rejects.toMatchObject({
      reason: "unreachable",
      status: 502,
    });
  });
});

/* ------------------------------------------------------------- the pieces */

describe("the password gate", () => {
  it("is open when the deploy sets no password", () => {
    expect(gateOpen(undefined, null)).toBe(true);
    expect(gateOpen(undefined, "anything")).toBe(true);
    expect(gateOpen("", "anything")).toBe(true);
  });

  it("is shut to anything but the password when one is set", () => {
    expect(gateOpen("luggage1234", "luggage1234")).toBe(true);
    expect(gateOpen("luggage1234", "Luggage1234")).toBe(false);
    expect(gateOpen("luggage1234", null)).toBe(false);
    expect(gateOpen("luggage1234", "")).toBe(false);
  });
});

describe("a generated run as a pool", () => {
  const entry = (id: string, over: object = {}) => ({
    card: { id, name: id } as Card,
    finish: "nonfoil",
    slot: 1,
    label: "common",
    ...over,
  });

  const pack = (ids: string[], over: Partial<GeneratedPack> = {}) =>
    ({
      cards: ids.map((id) => entry(id)),
      godPack: false,
      tokenSheet: null,
      landSheet: null,
      ...over,
    }) as GeneratedPack;

  it("keeps the packs and drops the pages that follow them", () => {
    const run = [
      pack(["a", "b"]),
      pack(["c", "d"]),
      pack(["t1"], { tokenSheet: 1 }),
      pack(["l1"], { landSheet: 1 }),
    ];
    expect(poolFromRun(run)).toEqual([
      [
        { id: "a", finish: "nonfoil" },
        { id: "b", finish: "nonfoil" },
      ],
      [
        { id: "c", finish: "nonfoil" },
        { id: "d", finish: "nonfoil" },
      ],
    ]);
  });

  it("drops the token separator, which is not a card anybody drafts", () => {
    const run = [
      {
        ...pack(["a"]),
        cards: [entry("a"), entry("sep", { bonus: true, slot: null })],
      } as GeneratedPack,
    ];
    expect(poolFromRun(run)).toEqual([[{ id: "a", finish: "nonfoil" }]]);
  });

  it("keeps the finish, and skips a card with no Scryfall id", () => {
    const run = [
      {
        ...pack([]),
        cards: [
          entry("a", { finish: "foil" }),
          { ...entry("x"), card: { name: "homeless" } as Card },
        ],
      } as GeneratedPack,
    ];
    expect(poolFromRun(run)).toEqual([[{ id: "a", finish: "foil" }]]);
  });
});

describe("card art from an id alone", () => {
  it("fans out on the first two characters, as Scryfall's CDN does", () => {
    expect(artById("3f9a1c2b-0000")).toBe(
      "https://cards.scryfall.io/normal/front/3/f/3f9a1c2b-0000.jpg",
    );
    expect(artById("3f9a1c2b-0000", "large")).toContain("/large/front/3/f/");
  });
});
