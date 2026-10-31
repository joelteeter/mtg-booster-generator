/*
 * Card pools for Play and Commander boosters.
 *
 * The pool keys here are the contract `lib/booster` samples from, so this file
 * and `lib/booster/types.ts` have to agree: a key renamed here silently empties
 * a slot there. `tests/fixtures.ts` lists every key the pure logic reads.
 *
 * Ported from `js/scryfall.js`. The per-set caches (`poolCache`, `cycleCache`,
 * `tokenCache`) are gone, because TanStack Query does that job above this layer
 * — see `queries.ts`. The two memoised sub-fetches stay: Special Guests and set
 * metadata are shared *within* a load, and refetching all of SPG for every set
 * would be a real regression.
 */
import {
  groupByName,
  isBackground,
  isLegendCreatureOrPW,
  isPiper,
  landCycleQuery,
  tokenSetCode,
} from "@/lib/booster";
import type { LandCycle, NameMap, PoolsMeta } from "@/lib/booster/types";

import { bonusPool } from "./bonus-pool";
import { optional, type ScryfallClient } from "./client";
import type { Card, ScryfallSet } from "./types";

/** Pools for one Play Booster set. Keys match what `playSpec` samples. */
export interface PlayPools {
  commons: NameMap;
  uncommons: NameMap;
  rares: NameMap;
  mythics: NameMap;
  nonBasicLands: NameMap;
  landBasics: NameMap;
  landDuals: NameMap;
  spg: NameMap;
  spgAll: NameMap;
  meta: PoolsMeta;
}

/** Pools for one Commander draft-booster set. Keys match `commanderSpec`. */
export interface CommanderPools {
  commons: NameMap;
  uncommons: NameMap;
  rares: NameMap;
  mythics: NameMap;
  legC: NameMap;
  legU: NameMap;
  legR: NameMap;
  legM: NameMap;
  legAll: NameMap;
  bgCU: NameMap;
  bgR: NameMap;
  piper: NameMap;
  etched: NameMap;
  allC: NameMap;
  allU: NameMap;
  allR: NameMap;
  allM: NameMap;
  spgAll: NameMap;
}

export interface ScryfallPools {
  getSpg(): Promise<Card[]>;
  getSetMeta(code: string): Promise<ScryfallSet | null>;
  loadPlayPools(code: string): Promise<PlayPools>;
  loadCommanderPools(code: string): Promise<CommanderPools>;
  loadCycle(cycle: LandCycle): Promise<NameMap>;
  loadTokens(code: string): Promise<Card[]>;
  /** The set metadata seen so far, which the set picker reads. */
  readonly setMeta: Record<string, ScryfallSet>;
}

/** A card is "in boosters" by name and rarity together, not by printing. */
const boosterKey = (c: Card): string => `${c.name}|${c.rarity}`;

const isBasic = (c: Card): boolean => /Basic/.test(c.type_line || "");

/**
 * A common dual land: produces two or more colours of real mana. This is how
 * the set's land-slot duals are told apart from ordinary common lands like
 * Terramorphic Expanse, which stay on the common sheet.
 */
const isCommonDual = (c: Card): boolean =>
  !isBasic(c) &&
  (c.produced_mana || []).filter((m) => "WUBRG".includes(m)).length >= 2;

export function createScryfallPools(client: ScryfallClient): ScryfallPools {
  /*
   * Special Guests live in one set shared by every Play set, so the fetch is
   * memoised across loads. A failure clears the memo so the next load retries.
   */
  let spgPromise: Promise<Card[]> | null = null;
  function getSpg(): Promise<Card[]> {
    if (!spgPromise)
      spgPromise = client.fetchPool(`set:spg`).catch((e: unknown) => {
        spgPromise = null;
        throw e;
      });
    return spgPromise;
  }

  const setMeta: Record<string, ScryfallSet> = {};
  async function getSetMeta(code: string): Promise<ScryfallSet | null> {
    if (setMeta[code]) return setMeta[code];
    const set = await client.getSet(code);
    if (set) setMeta[code] = set;
    return setMeta[code] || null;
  }

  async function loadPlayPools(code: string): Promise<PlayPools> {
    const s = `s:${code} -is:promo`;
    const [C0, U0, R0, M0, nonBasicLands0, landSlot, boosterCards, spgAll, meta] =
      await Promise.all([
        client.fetchPool(`${s} r:common -t:basic`),
        client.fetchPool(`${s} r:uncommon -t:basic`),
        client.fetchPool(`${s} r:rare -t:basic`),
        client.fetchPool(`${s} r:mythic -t:basic`),
        client.fetchPool(`${s} t:land -t:basic`),
        optional(client.fetchPool(`${s} (t:basic or (r:common t:land -t:creature))`)),
        /*
         * Many set codes also hold cards that are not in Play Boosters —
         * Foundations' starter-kit cards, for one. `is:booster` says which
         * are. Some sets have no `is:booster` data on Scryfall yet; then every
         * card is kept.
         */
        optional(client.fetchPool(`${s} is:booster -t:basic`)),
        getSpg(),
        getSetMeta(code),
      ]);
    if (R0.length === 0)
      throw new Error(`Set "${code.toUpperCase()}" not found (no rares).`);

    const inBooster = new Set(boosterCards.map(boosterKey));
    /*
     * Note the fallback: if filtering by `is:booster` would empty a rarity
     * entirely, the unfiltered list is kept instead. Scryfall's booster data
     * is sometimes partial, and an empty rarity breaks a guaranteed slot.
     * `loadCommanderPools` deliberately does *not* do this — see below.
     */
    const keep = (arr: Card[]): Card[] => {
      if (!inBooster.size) return arr;
      const kept = arr.filter((c) => inBooster.has(boosterKey(c)));
      return kept.length ? kept : arr;
    };

    /*
     * Real Play Boosters put the set's common dual lands in the land slot only
     * (half the time; basics the other half), so they come out of the common
     * slots. Other common lands stay on the common sheet.
     */
    const landBasics = landSlot.filter(isBasic);
    const landDuals = landSlot.filter(isCommonDual);
    const landSlotOnly = new Set(landDuals.map((c) => c.name));
    const commons = keep(C0).filter((c) => !landSlotOnly.has(c.name));

    // Special Guests: only this set's own, which share its release date.
    const released = meta && meta.released_at;
    const ownSpg = released
      ? spgAll.filter((c) => c.released_at === released)
      : [];

    return {
      commons: groupByName(commons.length ? commons : C0),
      uncommons: groupByName(keep(U0)),
      rares: groupByName(keep(R0)),
      mythics: groupByName(keep(M0)),
      nonBasicLands: groupByName(keep(nonBasicLands0)),
      landBasics: groupByName(landBasics),
      landDuals: groupByName(landDuals),
      spg: groupByName(ownSpg.length ? ownSpg : spgAll),
      spgAll: groupByName(spgAll),
      meta: {
        boosterFiltered: inBooster.size > 0,
        ownSpg: ownSpg.length,
        landSlotOnly: landSlotOnly.size,
      },
    };
  }

  async function loadCommanderPools(code: string): Promise<CommanderPools> {
    const s = `s:${code} -is:promo`;
    const [C0, U0, R0, M0, boosterCards, piper, etched, spg] = await Promise.all([
      client.fetchPool(`${s} r:common -t:basic`),
      client.fetchPool(`${s} r:uncommon -t:basic`),
      client.fetchPool(`${s} r:rare -t:basic`),
      client.fetchPool(`${s} r:mythic -t:basic`),
      /*
       * These set codes also hold their Commander precon deck cards;
       * `is:booster` tells us which names actually appear in draft boosters.
       */
      optional(client.fetchPool(`${s} is:booster -t:basic`)),
      optional(client.fetchPool(`s:${code} !"The Prismatic Piper"`)),
      code === "cmr"
        ? optional(client.fetchPool(`s:${code} is:etched`))
        : Promise.resolve<Card[]>([]),
      getSpg(),
      /*
       * Awaited but unused, exactly as in the original. It is not dead: it
       * populates the shared `setMeta` cache that the set picker reads, so
       * removing it would make the Commander tab stop warming it.
       */
      getSetMeta(code),
    ]);
    if (R0.length === 0)
      throw new Error(`Set "${code.toUpperCase()}" not found (no rares).`);

    /*
     * Keep every printing (showcase, borderless…) of a name+rarity that is in
     * boosters. Unlike the Play loader there is no "if it emptied, keep
     * everything" fallback: the official Commander sets all have complete
     * booster data, and falling back would quietly readmit precon-only cards.
     */
    const inBooster = new Set(boosterCards.map(boosterKey));
    const keep = (arr: Card[]): Card[] =>
      inBooster.size ? arr.filter((c) => inBooster.has(boosterKey(c))) : arr;
    const [C, U, R, M] = [keep(C0), keep(U0), keep(R0), keep(M0)];

    const legend = (c: Card): boolean =>
      isLegendCreatureOrPW(c) && !isBackground(c);
    const plain = (c: Card): boolean =>
      !isLegendCreatureOrPW(c) && !isBackground(c) && !isPiper(c);

    return {
      // Legendary commons stay in the common slots; the official Commander
      // sets have none, so this only matters for a borrowed layout.
      commons: groupByName(C.filter((c) => !isBackground(c) && !isPiper(c))),
      uncommons: groupByName(U.filter(plain)),
      rares: groupByName(R.filter(plain)),
      mythics: groupByName(M.filter(plain)),
      legC: groupByName(C.filter(legend)),
      legU: groupByName(U.filter(legend)),
      legR: groupByName(R.filter(legend)),
      legM: groupByName(M.filter(legend)),
      legAll: groupByName([...C, ...U, ...R, ...M].filter(legend)),
      bgCU: groupByName([...C, ...U].filter(isBackground)),
      bgR: groupByName([...R, ...M].filter(isBackground)),
      piper: groupByName(piper.filter(isPiper)),
      etched: groupByName(etched.filter(legend)),
      allC: groupByName(C.filter((c) => !isPiper(c))),
      allU: groupByName(U),
      allR: groupByName(R),
      allM: groupByName(M),
      spgAll: groupByName(spg),
    };
  }

  /** One bonus/separator land cycle. The classic cycle ships with the app. */
  async function loadCycle(cycle: LandCycle): Promise<NameMap> {
    if (cycle.builtIn) return groupByName(bonusPool);
    const cards = await client.fetchPool(
      landCycleQuery(cycle) + " -border:gold -is:oversized",
    );
    return groupByName(cards);
  }

  /**
   * A set's tokens and emblems. They live in their own Scryfall set, "t" plus
   * the set code, and `fetchPool` returns [] for a set that has none rather
   * than throwing.
   */
  async function loadTokens(code: string): Promise<Card[]> {
    const key = String(code || "").toLowerCase();
    if (!key) return [];
    return client.fetchPool(`set:${tokenSetCode(key)}`);
  }

  return {
    getSpg,
    getSetMeta,
    loadPlayPools,
    loadCommanderPools,
    loadCycle,
    loadTokens,
    get setMeta() {
      return setMeta;
    },
  };
}
