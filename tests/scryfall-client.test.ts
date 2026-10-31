/*
 * The request queue and the retry behaviour.
 *
 * None of this was testable before: the old `sfFetch` used the real clock, the
 * real `setTimeout` and wrote its notices straight into two DOM elements. With
 * the clock and the notice injected, the timing can be asserted without any
 * test actually waiting — and the error messages are compared against the old
 * implementation, because they are user-facing strings.
 */
import { describe, expect, it } from "vitest";

import {
  API,
  MAX_RETRIES,
  REQUEST_GAP_MS,
  createScryfallClient,
  optional,
} from "@/lib/scryfall/client";

import { card, fakeScryfall, poolQuery } from "./fake-scryfall";

/** A clock that records how long each sleep was asked for and skips it. */
function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

function clientWith(
  fetch: typeof globalThis.fetch,
  extra: Partial<Parameters<typeof createScryfallClient>[0]> = {},
) {
  const clock = fakeClock();
  const notices: string[] = [];
  /* The clock reading as each request actually goes out. */
  const dispatched: number[] = [];
  const timed = ((...args: Parameters<typeof globalThis.fetch>) => {
    dispatched.push(clock.now());
    return fetch(...args);
  }) as typeof globalThis.fetch;
  const client = createScryfallClient({
    fetch: timed,
    now: clock.now,
    sleep: clock.sleep,
    onNotice: (m) => notices.push(m),
    ...extra,
  });
  return { client, clock, notices, dispatched };
}

/** Gaps between consecutive requests leaving the queue. */
const gaps = (times: number[]): number[] =>
  times.slice(1).map((t, i) => t - times[i]);

describe("the shared request queue", () => {
  it("keeps requests 150ms apart when made one after another", async () => {
    const q = poolQuery("set:x");
    const fake = fakeScryfall({ search: { [q]: [card()] } });
    const { client, dispatched } = clientWith(fake.fetch);
    for (let i = 0; i < 5; i++) await client.fetchPool("set:x");
    // The first goes straight out; every later one waits out the gap.
    expect(gaps(dispatched)).toEqual(Array(4).fill(REQUEST_GAP_MS));
  });

  /*
   * The important property: the queue is shared, so five requests fired at
   * once are spaced out rather than all going at the same moment. A single
   * pack generation fans out into a dozen searches, and this is what keeps
   * that inside Scryfall's rate limit.
   */
  /*
   * Real timers with the gap shortened to 20ms, so the waits genuinely elapse
   * and genuinely elapse in order — the sleep-driven fake clock elsewhere in
   * this file cannot model that, because it advances time when a sleep is
   * requested rather than when it ends.
   *
   * `now` is frozen, which is the scenario: five requests claiming their slots
   * at the same instant. It also makes the test exact. Earlier versions
   * measured the wall-clock gaps between the requests going out and were
   * flaky — a millisecond ticking over between the first call and the rest is
   * enough to turn 40 into 39.
   */
  it("staggers requests made concurrently, not just sequential ones", async () => {
    const q = poolQuery("set:x");
    const fake = fakeScryfall({ search: { [q]: [card()] } });
    const gap = 20;
    const dispatched: number[] = [];
    const waits: number[] = [];
    const timed = ((...args: Parameters<typeof globalThis.fetch>) => {
      dispatched.push(Date.now());
      return fake.fetch(...args);
    }) as typeof globalThis.fetch;
    const start = Date.now();
    const client = createScryfallClient({
      fetch: timed,
      requestGapMs: gap,
      now: () => start,
      // Real timers, so the waits actually elapse, and in order.
      sleep: (ms) => {
        waits.push(ms);
        return new Promise((resolve) => setTimeout(resolve, ms));
      },
    });

    await Promise.all(
      Array.from({ length: 5 }, () => client.fetchPool("set:x")),
    );

    // All five claim a slot in the same tick. The first goes out at once and
    // the rest are held one gap further apart each: the queue is shared state,
    // not a per-request delay.
    expect(dispatched).toHaveLength(5);
    expect(waits).toEqual([gap, gap * 2, gap * 3, gap * 4]);
    expect(dispatched[4]).toBeGreaterThan(dispatched[0]);
  });

  it("holds the whole queue when Scryfall asks us to slow down", async () => {
    const q = poolQuery("set:x");
    const fake = fakeScryfall({
      search: { [q]: [card()] },
      failures: [{ kind: "status", status: 429, headers: { "Retry-After": "2" } }],
    });
    const { client, clock, notices } = clientWith(fake.fetch);
    // Two requests at once: the first hits the 429 and holds the line.
    await Promise.all([client.fetchPool("set:x"), client.fetchPool("set:x")]);
    expect(notices).toContain(
      "⏳ Scryfall asked us to slow down; continuing in 3s…",
    );
    // Retry-After 2s plus the half-second margin, so the retry waits 2.5s.
    expect(Math.max(...clock.sleeps)).toBeGreaterThanOrEqual(2500);
  });
});

describe("retrying", () => {
  const q = poolQuery("set:x");
  const ok = { [q]: [card()] };

  it("retries a 429 and succeeds", async () => {
    const fake = fakeScryfall({
      search: ok,
      failures: [{ kind: "status", status: 429, headers: { "Retry-After": "1" } }],
    });
    const { client, notices } = clientWith(fake.fetch);
    await expect(client.fetchPool("set:x")).resolves.toHaveLength(1);
    expect(notices).toEqual([
      "⏳ Scryfall asked us to slow down; continuing in 2s…",
    ]);
  });

  it("waits 10s plus a margin when Retry-After is missing or unparseable", async () => {
    for (const headers of [undefined, { "Retry-After": "soon" }]) {
      const fake = fakeScryfall({
        search: ok,
        failures: [{ kind: "status", status: 429, headers }],
      });
      const { client, notices } = clientWith(fake.fetch);
      await client.fetchPool("set:x");
      expect(notices).toEqual([
        "⏳ Scryfall asked us to slow down; continuing in 11s…",
      ]);
    }
  });

  it("gives up after MAX_RETRIES 429s, with the old message", async () => {
    const failures = Array.from({ length: MAX_RETRIES + 1 }, () => ({
      kind: "status" as const,
      status: 429,
    }));
    const fake = fakeScryfall({ search: ok, failures });
    const { client } = clientWith(fake.fetch);
    const message = await client.fetchPool("set:x").catch((e: Error) => e.message);

    expect(message).toBe(
      "Scryfall is rate-limiting requests (429). Wait a minute and try again.",
    );
  });

  /*
   * A 429 without CORS headers reaches the browser as a plain network error,
   * indistinguishable from being offline, so both are retried the same way.
   */
  it("retries a network failure with a growing backoff", async () => {
    const fake = fakeScryfall({
      search: ok,
      failures: [{ kind: "network" }, { kind: "network" }],
    });
    const { client, clock, notices } = clientWith(fake.fetch);
    await expect(client.fetchPool("set:x")).resolves.toHaveLength(1);
    expect(notices).toEqual([
      "⏳ Scryfall didn't answer; trying again in 10s…",
      "⏳ Scryfall didn't answer; trying again in 20s…",
    ]);
    /*
     * 10s then 20s of backoff, each with the queue's own 150ms gap on top:
     * `takeTurn` adds the backoff to the next free slot, not to "now".
     */
    expect(clock.sleeps).toEqual([10000 + REQUEST_GAP_MS, 20000 + REQUEST_GAP_MS]);
  });

  it("gives up after MAX_RETRIES network failures, with the old message", async () => {
    const failures = Array.from({ length: MAX_RETRIES + 1 }, () => ({
      kind: "network" as const,
    }));
    const fake = fakeScryfall({ search: ok, failures });
    const { client } = clientWith(fake.fetch);
    const message = await client.fetchPool("set:x").catch((e: Error) => e.message);

    expect(message).toBe(
      "Couldn't reach Scryfall (network error or rate limit). Wait a minute and try again.",
    );
  });
});

describe("search", () => {
  it("appends the unique mode and encodes the query", async () => {
    const fake = fakeScryfall({
      search: { "set:dsk r:rare unique:prints": [card()], "t:plane unique:cards": [card()] },
    });
    const { client } = clientWith(fake.fetch);
    await client.fetchPool("set:dsk r:rare");
    await client.search("t:plane", { unique: "cards" });
    expect(fake.queries).toEqual([
      "set:dsk r:rare unique:prints",
      "t:plane unique:cards",
    ]);
    expect(fake.unknown).toEqual([]);
  });

  it("treats a 404 as empty for pools but as an error for a plain search", async () => {
    const fake = fakeScryfall({ search: {} });
    const { client } = clientWith(fake.fetch);
    await expect(client.fetchPool("set:nothing")).resolves.toEqual([]);
    await expect(client.search("set:nothing")).rejects.toThrow(
      "Scryfall API Error: 404",
    );
  });

  it("raises other HTTP errors with the status", async () => {
    const fake = fakeScryfall({
      search: {},
      failures: [{ kind: "status", status: 503 }],
    });
    const { client } = clientWith(fake.fetch);
    await expect(client.fetchPool("set:x")).rejects.toThrow(
      "Scryfall API Error: 503",
    );
  });

  it("collects every page in order", async () => {
    const cards = Array.from({ length: 7 }, (_, i) => card({ name: `C${i}` }));
    const fake = fakeScryfall({
      search: { [poolQuery("set:big")]: cards },
      pageSize: 2,
    });
    const { client } = clientWith(fake.fetch);
    const out = await client.fetchPool("set:big");
    expect(out.map((c) => c.name)).toEqual(cards.map((c) => c.name));
  });
});

describe("optional", () => {
  it("turns a failed query into no cards", async () => {
    await expect(optional(Promise.reject(new Error("boom")))).resolves.toEqual([]);
    await expect(optional(Promise.resolve([card()]))).resolves.toHaveLength(1);
  });
});

describe("sets and random cards", () => {
  it("returns the set listing", async () => {
    const setList = [{ code: "dsk", name: "Duskmourn" }];
    const fake = fakeScryfall({ setList });
    const { client } = clientWith(fake.fetch);
    expect(await client.getSets()).toEqual(setList);
    expect(fake.paths).toEqual(["sets"]);
  });

  it("returns null rather than throwing when set metadata is unavailable", async () => {
    const fake = fakeScryfall({ sets: {} });
    const { client } = clientWith(fake.fetch);
    expect(await client.getSet("zzz")).toBeNull();
  });

  it("fetches a random card", async () => {
    const theList = card({ name: "A List Card" });
    const fake = fakeScryfall({ random: { "set:plst": theList } });
    const { client } = clientWith(fake.fetch);
    expect((await client.fetchRandom("set:plst")).name).toBe("A List Card");
    await expect(client.fetchRandom("set:none")).rejects.toThrow(
      "Scryfall API Error: 404",
    );
  });

  /*
   * The old `js/scryfall.js` used exactly these, and the queue's behaviour is
   * built on them: 150 ms is about six requests a second, inside Scryfall's
   * "ten a second on average" guidance.
   */
  it("keeps the request settings the old code used", () => {
    expect(API).toBe("https://api.scryfall.com/");
    expect(REQUEST_GAP_MS).toBe(150);
    expect(MAX_RETRIES).toBe(3);
  });
});
