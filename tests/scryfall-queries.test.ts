/*
 * The TanStack Query wiring that replaces the old `poolCache` globals.
 *
 * Thin by design, so this checks the two things that could go wrong: the keys
 * are distinct per set and per kind (a shared key would serve Commander pools
 * to the Play tab), and a real QueryClient dedupes concurrent loads the way
 * `ensureLoaded` did by hand.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import { scryfallKeys, scryfallQueries } from "@/lib/scryfall/queries";
import type { Card, ScryfallSet } from "@/lib/scryfall/types";

import { card, fakeScryfall, poolQuery } from "./fake-scryfall";

function setup(search: Record<string, Card[]>, sets: Record<string, ScryfallSet> = {}) {
  const fake = fakeScryfall({ search, sets });
  const client = createScryfallClient({
    fetch: fake.fetch,
    requestGapMs: 0,
    sleep: async () => {},
  });
  const pools = createScryfallPools(client);
  const queries = scryfallQueries({
    pools,
    getSets: () => client.getSets(),
    searchCards: (query, unique) => client.search(query, { unique }),
  });
  return { fake, pools, queries };
}

function playSearch(code: string): Record<string, Card[]> {
  const s = `s:${code} -is:promo`;
  return {
    [poolQuery(`${s} r:common -t:basic`)]: [card({ rarity: "common" })],
    [poolQuery(`${s} r:uncommon -t:basic`)]: [card({ rarity: "uncommon" })],
    [poolQuery(`${s} r:rare -t:basic`)]: [card({ rarity: "rare" })],
    [poolQuery(`${s} r:mythic -t:basic`)]: [card({ rarity: "mythic" })],
    [poolQuery(`${s} t:land -t:basic`)]: [],
    [poolQuery(`${s} (t:basic or (r:common t:land -t:creature))`)]: [],
    [poolQuery(`${s} is:booster -t:basic`)]: [],
    [poolQuery(`set:spg`)]: [],
  };
}

describe("query keys", () => {
  it("separate the two booster kinds and every set", () => {
    const keys = [
      scryfallKeys.playPools("dsk"),
      scryfallKeys.playPools("blb"),
      scryfallKeys.commanderPools("dsk"),
      scryfallKeys.tokens("dsk"),
      scryfallKeys.cycle("shock"),
      scryfallKeys.sets(),
    ].map((k) => JSON.stringify(k));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all sit under one root, so a single invalidate clears Scryfall", () => {
    for (const key of [
      scryfallKeys.sets(),
      scryfallKeys.playPools("dsk"),
      scryfallKeys.commanderPools("cmr"),
      scryfallKeys.tokens("dsk"),
      scryfallKeys.cycle("shock"),
    ])
      expect(key[0]).toBe("scryfall");
  });
});

describe("caching through a QueryClient", () => {
  it("loads a set's pools once, however many times they are asked for", async () => {
    const { fake, queries } = setup(playSearch("dsk"), {
      dsk: { code: "dsk", name: "Duskmourn", released_at: "2024-09-27" },
    });
    const qc = new QueryClient();
    const options = queries.playPools("dsk");

    // Concurrent, then again afterwards: one fan-out of requests in total.
    await Promise.all([qc.fetchQuery(options), qc.fetchQuery(options)]);
    await qc.fetchQuery(options);

    expect(fake.queries.filter((q) => q.includes("r:rare"))).toHaveLength(1);
    expect(fake.unknown).toEqual([]);
  });

  it("does not serve one set's pools for another", async () => {
    const { queries } = setup({ ...playSearch("dsk"), ...playSearch("blb") });
    const qc = new QueryClient();
    const a = await qc.fetchQuery(queries.playPools("dsk"));
    const b = await qc.fetchQuery(queries.playPools("blb"));
    expect(a).not.toBe(b);
  });

  /*
   * `client.request` already retries 429s and network failures, so a
   * Query-level retry would replay the whole dozen-request fan-out on top of
   * that. The old `ensureLoaded` behaved the same way: it dropped the cache
   * entry and left the next user action to retry.
   */
  it("does not retry a failed load by itself", async () => {
    const { fake, queries } = setup({});
    const qc = new QueryClient();
    await expect(qc.fetchQuery(queries.playPools("zzz"))).rejects.toThrow();
    // Four rarity queries, the two optional ones, SPG — but no second round.
    expect(fake.queries.filter((q) => q.includes("r:rare"))).toHaveLength(1);
  });

  it("serves the built-in cycle and the set list through the same wiring", async () => {
    const { queries } = setup({});
    const qc = new QueryClient();
    const map = await qc.fetchQuery(
      queries.cycle({ id: "classic", label: "Classic", builtIn: true }),
    );
    expect(map.size).toBe(20);
    await expect(qc.fetchQuery(queries.sets())).resolves.toEqual([]);
  });
});
