/*
 * The pool loaders, against values recorded from the old app.
 *
 * Two things are compared for every load: the queries it issues, and the
 * pools it produces. The queries matter as much as the pools — a loader that
 * asked for `r:mythic` without `-t:basic` would still produce plausible pools.
 *
 * Until phase 6 this ran `js/scryfall.js` alongside the port against the same
 * fake Scryfall. The old implementation is gone; `tests/golden/scryfall-pools.txt`
 * holds what it did.
 */
import { describe, expect, it } from "vitest";

import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import type { Card, ScryfallSet } from "@/lib/scryfall/types";

import {
  card,
  fakeScryfall,
  normPools,
  poolQuery,
  resetCardIds,
} from "./fake-scryfall";
import { golden, readGolden } from "./goldens";
import {
  DSK_RELEASED,
  commanderFixture,
  commanderRoutes,
  playFixture,
  playRoutes,
} from "./pool-fixtures";
import { renderValue } from "./render";

/* -------------------------------------------------------------------------
 * Running a load and checking it against the old app
 * ---------------------------------------------------------------------- */

const recorded = readGolden("scryfall-pools");

interface Routes {
  search: Record<string, Card[]>;
  sets: Record<string, ScryfallSet>;
}

const sorted = (a: string[]) => [...a].sort();

const newPools = (fetch: typeof globalThis.fetch) =>
  createScryfallPools(
    createScryfallClient({ fetch, requestGapMs: 0, sleep: async () => {} }),
  );

/**
 * Loads a set's pools and checks the whole load — queries, paths and pools —
 * against what the old app did for the same case.
 */
async function runPlay(
  key: string,
  code: string,
  makeRoutes: () => Routes,
  pageSize?: number,
) {
  // Card ids count from one for each case, so the recorded ids line up.
  resetCardIds();
  const routes = makeRoutes();
  const fake = fakeScryfall({ ...routes, pageSize });
  const pools = await newPools(fake.fetch).loadPlayPools(code);
  expect(
    renderValue({
      queries: sorted(fake.queries),
      paths: sorted(fake.paths),
      unknown: fake.unknown,
      pools: normPools(pools),
    }),
  ).toBe(golden(recorded, key));
  return { fake, pools, routes };
}

async function runCommander(
  key: string,
  code: string,
  makeRoutes: () => Routes,
) {
  resetCardIds();
  const routes = makeRoutes();
  const fake = fakeScryfall(routes);
  const pools = await newPools(fake.fetch).loadCommanderPools(code);
  expect(
    renderValue({
      queries: sorted(fake.queries),
      paths: sorted(fake.paths),
      unknown: fake.unknown,
      pools: normPools(pools),
    }),
  ).toBe(golden(recorded, key));
  return { fake, pools, routes };
}

/* -------------------------------------------------------------------------
 * Tests
 * ---------------------------------------------------------------------- */

describe("loadPlayPools parity", () => {
  it("issues the same queries and builds the same pools", async () => {
    await runPlay("play dsk", "dsk", () => playRoutes("dsk"));
  });

  it("pulls the set's common dual lands out of the common sheet", async () => {
    const { pools: newPools } = await runPlay("play dsk", "dsk", () => playRoutes("dsk"));
    const commonNames = Array.from(newPools.commons.keys());
    expect(commonNames).not.toContain("Dual Land");
    // A common land that is not a dual stays on the common sheet.
    expect(commonNames).toContain("Terramorphic");
    expect(Array.from(newPools.landDuals.keys())).toEqual(["Dual Land"]);
    expect(Array.from(newPools.landBasics.keys()).sort()).toEqual(["Island", "Plains"]);
    expect(newPools.meta.landSlotOnly).toBe(1);
  });

  it("keeps only Special Guests sharing the set's release date", async () => {
    const { pools: newPools } = await runPlay("play dsk", "dsk", () => playRoutes("dsk"));
    expect(Array.from(newPools.spg.keys())).toEqual(["Guest Own"]);
    expect(Array.from(newPools.spgAll.keys()).sort()).toEqual(["Guest Other", "Guest Own"]);
    expect(newPools.meta.ownSpg).toBe(1);
  });

  it("falls back to every Special Guest when the set has no metadata", async () => {
    const { pools: newPools } = await runPlay(
      "play dsk no-set-metadata",
      "dsk",
      () => playRoutes("dsk", { set: null }),
    );
    expect(Array.from(newPools.spg.keys()).sort()).toEqual(["Guest Other", "Guest Own"]);
    expect(newPools.meta.ownSpg).toBe(0);
  });

  it("keeps every card when the set has no is:booster data", async () => {
    const { pools: newPools } = await runPlay(
      "play dsk no-booster-data",
      "dsk",
      () => playRoutes("dsk", { booster: [] }),
    );
    expect(newPools.meta.boosterFiltered).toBe(false);
    // "Common One" was only excluded by the booster filter, so it is back.
    expect(Array.from(newPools.commons.keys())).toContain("Common One");
  });

  /*
   * The Play loader's fallback: if filtering by is:booster would empty a
   * rarity entirely, the unfiltered list is kept, because an empty rarity
   * breaks a guaranteed slot. The Commander loader deliberately does not do
   * this — asserted below.
   */
  it("keeps a rarity the booster filter would have emptied", async () => {
    const { pools: newPools } = await runPlay(
      "play dsk booster-empties-uncommons",
      "dsk",
      () => {
        const f = playFixture();
        return playRoutes("dsk", {
          booster: [...f.commons, ...f.rares, ...f.mythics],
        });
      },
    );
    expect(newPools.uncommons.size).toBe(2);
  });

  it("follows next_page so a big set is not cut off", async () => {
    // One card per page forces every query to paginate.
    const paged = await runPlay(
      "play dsk paginated",
      "dsk",
      () => playRoutes("dsk"),
      1,
    );
    // Paginating must not lose or duplicate anything: the pools are identical
    // to the same fixture served in a single page.
    const single = await runPlay("play dsk", "dsk", () => playRoutes("dsk"));
    expect(normPools(paged.pools)).toEqual(normPools(single.pools));
    // And the fixture really is bigger than one page, or this proves nothing.
    expect(paged.routes.search[poolQuery("s:dsk -is:promo r:common -t:basic")].length)
      .toBeGreaterThan(1);
  });

  it("throws the same error for a set with no rares", async () => {
    const routes = playRoutes("zzz", { rares: [] });
    const fake = fakeScryfall(routes);
    const newErr = await newPools(fake.fetch)
      .loadPlayPools("zzz")
      .catch((e: Error) => e.message);
    expect(newErr).toBe('Set "ZZZ" not found (no rares).');
  });
});

describe("loadCommanderPools parity", () => {
  for (const code of ["cmr", "clb", "cmm"]) {
    it(`issues the same queries and builds the same pools for ${code}`, async () => {
      await runCommander(`cmd ${code}`, code, () => commanderRoutes(code));
    });
  }

  it("asks for etched legends only for Commander Legends", async () => {
    const cmr = await runCommander("cmd cmr", "cmr", () => commanderRoutes("cmr"));
    expect(cmr.fake.queries.some((q) => q.includes("is:etched"))).toBe(true);
    expect(cmr.pools.etched.size).toBe(1);

    const clb = await runCommander("cmd clb", "clb", () => commanderRoutes("clb"));
    expect(clb.fake.queries.some((q) => q.includes("is:etched"))).toBe(false);
    expect(clb.pools.etched.size).toBe(0);
  });

  it("splits legends, Backgrounds and the Piper out of the plain pools", async () => {
    const { pools: newPools } = await runCommander(
      "cmd cmr",
      "cmr",
      () => commanderRoutes("cmr"),
    );
    // Legendary commons stay on the common sheet; the Piper and Backgrounds do not.
    const commons = Array.from(newPools.commons.keys()).sort();
    expect(commons).toEqual(["Common Legend", "Plain Common"]);
    expect(Array.from(newPools.uncommons.keys())).toEqual(["Plain Uncommon"]);
    expect(Array.from(newPools.legU.keys())).toEqual(["Uncommon Legend"]);
    expect(Array.from(newPools.bgCU.keys()).sort()).toEqual([
      "Common Background",
      "Uncommon Background",
    ]);
    expect(Array.from(newPools.bgR.keys())).toEqual(["Rare Background"]);
    expect(Array.from(newPools.piper.keys())).toEqual(["The Prismatic Piper"]);
    // allC excludes the Piper but keeps Backgrounds and legends.
    expect(Array.from(newPools.allC.keys())).not.toContain("The Prismatic Piper");
    /*
     * Five, not four: The Prismatic Piper is itself a Legendary Creature, so
     * the `legend` predicate counts it and it appears in legAll and legC
     * alongside the four plain legends. Only the `piper`, `commons` and `allC`
     * pools treat it specially. Surprising, but it is what the old code did,
     * and a legendary slot landing on the Piper is legitimate.
     */
    expect(newPools.legAll.size).toBe(5);
    expect(Array.from(newPools.legC.keys()).sort()).toEqual([
      "Common Legend",
      "The Prismatic Piper",
    ]);
  });

  /*
   * The asymmetry with the Play loader, kept deliberately: here a rarity the
   * booster filter empties stays empty. Falling back would quietly readmit the
   * precon-only cards that is:booster exists to exclude.
   */
  it("leaves a rarity empty when the booster filter excludes all of it", async () => {
    const { pools: newPools } = await runCommander(
      "cmd cmr booster-empties-uncommons",
      "cmr",
      () => {
        const f = commanderFixture();
        return commanderRoutes("cmr", {
          booster: [...f.commons, ...f.rares, ...f.mythics],
        });
      },
    );
    expect(newPools.uncommons.size).toBe(0);
    expect(newPools.legU.size).toBe(0);
  });

  it("throws the same error for a set with no rares", async () => {
    const routes = commanderRoutes("cmr", { rares: [] });
    const fake = fakeScryfall(routes);
    const newErr = await newPools(fake.fetch)
      .loadCommanderPools("cmr")
      .catch((e: Error) => e.message);
    expect(newErr).toBe('Set "CMR" not found (no rares).');
  });
});

describe("shared sub-fetches", () => {
  it("fetches Special Guests once across several set loads", async () => {
    const routes = {
      search: { ...playRoutes("dsk").search, ...playRoutes("blb").search },
      sets: { ...playRoutes("dsk").sets, ...playRoutes("blb").sets },
    };
    const fake = fakeScryfall(routes);
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    await pools.loadPlayPools("dsk");
    await pools.loadPlayPools("blb");
    expect(fake.queries.filter((q) => q.startsWith("set:spg"))).toHaveLength(1);
  });

  it("retries Special Guests after a failure instead of caching the error", async () => {
    const routes = playRoutes("dsk");
    const fake = fakeScryfall({ ...routes, failures: [{ kind: "status", status: 500 }] });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    await expect(pools.loadPlayPools("dsk")).rejects.toThrow();
    // The memo was cleared, so the second attempt asks again and succeeds.
    await expect(pools.loadPlayPools("dsk")).resolves.toBeTruthy();
  });

  it("caches set metadata and exposes it for the set picker", async () => {
    const routes = playRoutes("dsk");
    const fake = fakeScryfall(routes);
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    await pools.loadPlayPools("dsk");
    await pools.loadPlayPools("dsk");
    expect(fake.paths.filter((p) => p === "sets/dsk")).toHaveLength(1);
    expect(pools.setMeta.dsk.released_at).toBe(DSK_RELEASED);
  });

  /*
   * The Commander loader awaits getSetMeta and throws the result away. That is
   * not dead code: it warms the shared metadata cache the set picker reads, so
   * the Commander tab populates it too. Preserved from the original.
   */
  it("warms the set metadata cache from the Commander loader too", async () => {
    const routes = commanderRoutes("cmr");
    const fake = fakeScryfall(routes);
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    await pools.loadCommanderPools("cmr");
    expect(fake.paths).toContain("sets/cmr");
    expect(pools.setMeta.cmr.code).toBe("cmr");
  });
});

describe("tokens and land cycles", () => {
  it("looks tokens up in the set's own token set", async () => {
    resetCardIds();
    const tokens = [card({ name: "Spirit", collector_number: "6" })];
    const fake = fakeScryfall({ search: { [poolQuery("set:tdsk")]: tokens } });

    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    expect(
      renderValue({ queries: fake.queries, tokens: await pools.loadTokens("DSK") }),
    ).toBe(golden(recorded, "tokens DSK"));
    expect(fake.unknown).toEqual([]);
  });

  it("returns nothing for a set with no token set, rather than throwing", async () => {
    const fake = fakeScryfall({ search: {} });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    await expect(pools.loadTokens("zzz")).resolves.toEqual([]);
    await expect(pools.loadTokens("")).resolves.toEqual([]);
  });

  it("serves the built-in classic cycle without a request", async () => {
    const fake = fakeScryfall({ search: {} });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    const map = await pools.loadCycle({
      id: "classic",
      label: "Classic",
      builtIn: true,
    });
    expect(fake.queries).toEqual([]);
    expect(map.size).toBe(20);
  });

  it("queries a real cycle the same way the old code did", async () => {
    resetCardIds();
    const cycle = { id: "shock", label: "Shock lands", names: ["Steam Vents", "Blood Crypt"] };
    const cards = [card({ name: "Steam Vents" }), card({ name: "Blood Crypt" })];
    const q = poolQuery(
      '(!"Steam Vents" or !"Blood Crypt") game:paper -is:promo -border:gold -is:oversized',
    );
    const fake = fakeScryfall({ search: { [q]: cards } });

    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    expect(
      renderValue({
        queries: fake.queries,
        map: normPools({ m: await pools.loadCycle(cycle) }),
      }),
    ).toBe(golden(recorded, "cycle shock"));
    expect(fake.unknown).toEqual([]);
  });
});
