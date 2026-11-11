/*
 * TanStack Query wiring for Scryfall.
 *
 * This replaces the hand-rolled `poolCache`, `cycleCache` and `tokenCache`
 * globals: the caching, deduping and in-flight sharing they did by hand are
 * what Query does by default. The rate-limit queue stays underneath in
 * `client.ts`, because Query has no notion of being polite to an upstream API.
 *
 * `staleTime: Infinity` because a released set's card list does not change
 * while the tab is open, and refetching a pool is a dozen Scryfall requests.
 * `retry: false` because `client.request` already retries 429s and network
 * failures; a Query-level retry would replay the whole fan-out on top of that.
 * The old `ensureLoaded` behaved the same way — it dropped the cache entry on
 * failure so the next user action retried, rather than retrying by itself.
 *
 * The QueryClient provider lands in phase 3 with the first component that
 * needs it; these options are plain data and are used from tests today.
 */
import { queryOptions } from "@tanstack/react-query";

import type { LandCycle } from "@/lib/booster/types";

import type { ScryfallPools } from "./pools";
import type { Card, UniqueMode } from "./types";

/** One root, so a single `invalidateQueries` clears everything Scryfall. */
export const scryfallKeys = {
  all: ["scryfall"] as const,
  sets: () => [...scryfallKeys.all, "sets"] as const,
  playPools: (code: string) =>
    [...scryfallKeys.all, "pools", "play", code] as const,
  commanderPools: (code: string) =>
    [...scryfallKeys.all, "pools", "commander", code] as const,
  tokens: (code: string) => [...scryfallKeys.all, "tokens", code] as const,
  lands: (code: string) => [...scryfallKeys.all, "lands", code] as const,
  cycle: (id: string) => [...scryfallKeys.all, "cycle", id] as const,
  search: (query: string, unique?: UniqueMode) =>
    [...scryfallKeys.all, "search", query, unique ?? null] as const,
};

const shared = { staleTime: Infinity, retry: false as const };

export interface ScryfallQueryDeps {
  pools: ScryfallPools;
  getSets: () => Promise<import("./types").ScryfallSet[]>;
  /** A plain paginated search, for the pools that are not card pools. */
  searchCards: (
    query: string,
    unique?: UniqueMode,
    signal?: AbortSignal,
  ) => Promise<Card[]>;
}

/*
 * Every `queryFn` below takes Query's `signal` and hands it to the client.
 * Query aborts it once nothing is waiting on the answer, which is what stops
 * a set you have navigated away from spending another dozen requests on
 * Scryfall's rate limit.
 */

export function scryfallQueries({
  pools,
  getSets,
  searchCards,
}: ScryfallQueryDeps) {
  return {
    sets: () =>
      queryOptions({ ...shared, queryKey: scryfallKeys.sets(), queryFn: getSets }),

    playPools: (code: string) =>
      queryOptions({
        ...shared,
        queryKey: scryfallKeys.playPools(code),
        queryFn: ({ signal }) => pools.loadPlayPools(code, signal),
        enabled: !!code,
      }),

    commanderPools: (code: string) =>
      queryOptions({
        ...shared,
        queryKey: scryfallKeys.commanderPools(code),
        queryFn: ({ signal }) => pools.loadCommanderPools(code, signal),
        enabled: !!code,
      }),

    tokens: (code: string) =>
      queryOptions({
        ...shared,
        queryKey: scryfallKeys.tokens(code),
        queryFn: ({ signal }) => pools.loadTokens(code, signal),
        enabled: !!code,
      }),

    /** Every land printing in a set, for the land sheet. */
    lands: (code: string) =>
      queryOptions({
        ...shared,
        queryKey: scryfallKeys.lands(code),
        queryFn: ({ signal }) => pools.loadLands(code, signal),
        enabled: !!code,
      }),

    /*
     * One search, cached by its exact query text. The simulators use this:
     * every Plane or every Scheme is a single paginated search rather than a
     * per-set pool, so there is nothing for `pools.ts` to do with it.
     */
    search: (query: string, unique?: UniqueMode) =>
      queryOptions({
        ...shared,
        queryKey: scryfallKeys.search(query, unique),
        queryFn: ({ signal }) => searchCards(query, unique, signal),
        enabled: !!query,
      }),

    cycle: (cycle: LandCycle) =>
      queryOptions({
        ...shared,
        queryKey: scryfallKeys.cycle(cycle.id),
        queryFn: ({ signal }) => pools.loadCycle(cycle, signal),
      }),
  };
}
