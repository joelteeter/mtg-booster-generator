/*
 * Old-vs-new parity for the pool loaders.
 *
 * Both implementations run against the same fake Scryfall and are compared on
 * two things: the queries they issue, and the pools they produce. The query
 * comparison matters as much as the pools — a port that asked for
 * `r:mythic` without `-t:basic` would still produce plausible pools.
 */
import { describe, expect, it } from "vitest";

import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import type { Card, ScryfallSet } from "@/lib/scryfall/types";

import { card, fakeScryfall, normPools, poolQuery } from "./fake-scryfall";
import { loadLegacyScryfall } from "./legacy-scryfall";

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const DSK_RELEASED = "2024-09-27";

/** A Duskmourn-shaped Play set, with the awkward cases built in. */
function playFixture() {
  const commons = [
    card({ name: "Common One", rarity: "common" }),
    card({ name: "Common Two", rarity: "common" }),
    // Two printings of one name: grouping must collapse them.
    card({ name: "Common Two", rarity: "common", frame_effects: ["showcase"] }),
    // A common dual land, which belongs in the land slot only.
    card({
      name: "Dual Land",
      rarity: "common",
      type_line: "Land",
      produced_mana: ["W", "U"],
    }),
    // A common land that is NOT a dual: stays on the common sheet.
    card({ name: "Terramorphic", rarity: "common", type_line: "Land" }),
  ];
  const uncommons = [
    card({ name: "Uncommon One", rarity: "uncommon" }),
    card({ name: "Uncommon Two", rarity: "uncommon" }),
  ];
  const rares = [card({ name: "Rare One", rarity: "rare" })];
  const mythics = [card({ name: "Mythic One", rarity: "mythic" })];
  const nonBasicLands = [
    card({ name: "Dual Land", rarity: "common", type_line: "Land", produced_mana: ["W", "U"] }),
    card({ name: "Terramorphic", rarity: "common", type_line: "Land" }),
  ];
  const landSlot = [
    card({ name: "Plains", rarity: "common", type_line: "Basic Land — Plains" }),
    card({ name: "Island", rarity: "common", type_line: "Basic Land — Island" }),
    card({
      name: "Dual Land",
      rarity: "common",
      type_line: "Land",
      produced_mana: ["W", "U"],
    }),
  ];
  // `is:booster` omits "Common One", so it is filtered out of the commons.
  const booster = [
    ...commons.filter((c) => c.name !== "Common One"),
    ...uncommons,
    ...rares,
    ...mythics,
  ];
  const spgAll = [
    card({ name: "Guest Own", rarity: "rare", released_at: DSK_RELEASED }),
    card({ name: "Guest Other", rarity: "rare", released_at: "2023-01-01" }),
  ];
  return { commons, uncommons, rares, mythics, nonBasicLands, landSlot, booster, spgAll };
}

interface PlayCaseOverrides {
  booster?: Card[];
  landSlot?: Card[];
  rares?: Card[];
  set?: ScryfallSet | null;
  spgAll?: Card[];
}

function playRoutes(code: string, o: PlayCaseOverrides = {}) {
  const f = playFixture();
  const s = `s:${code} -is:promo`;
  const search: Record<string, Card[]> = {
    [poolQuery(`${s} r:common -t:basic`)]: f.commons,
    [poolQuery(`${s} r:uncommon -t:basic`)]: f.uncommons,
    [poolQuery(`${s} r:rare -t:basic`)]: o.rares ?? f.rares,
    [poolQuery(`${s} r:mythic -t:basic`)]: f.mythics,
    [poolQuery(`${s} t:land -t:basic`)]: f.nonBasicLands,
    [poolQuery(`${s} (t:basic or (r:common t:land -t:creature))`)]:
      o.landSlot ?? f.landSlot,
    [poolQuery(`${s} is:booster -t:basic`)]: o.booster ?? f.booster,
    [poolQuery(`set:spg`)]: o.spgAll ?? f.spgAll,
  };
  const sets: Record<string, ScryfallSet> = {};
  const set = o.set === undefined ? { code, name: code.toUpperCase(), released_at: DSK_RELEASED } : o.set;
  if (set) sets[code] = set;
  return { search, sets };
}

/** A Commander-Legends-shaped set: legends, Backgrounds, Piper, etched. */
function commanderFixture() {
  const legend = (name: string, rarity: Card["rarity"]) =>
    card({ name, rarity, type_line: "Legendary Creature — Human Wizard" });
  const background = (name: string, rarity: Card["rarity"]) =>
    card({ name, rarity, type_line: "Legendary Enchantment — Background" });

  const commons = [
    card({ name: "Plain Common", rarity: "common" }),
    card({ name: "The Prismatic Piper", rarity: "common", type_line: "Legendary Creature — Shapeshifter" }),
    background("Common Background", "common"),
    legend("Common Legend", "common"),
  ];
  const uncommons = [
    card({ name: "Plain Uncommon", rarity: "uncommon" }),
    legend("Uncommon Legend", "uncommon"),
    background("Uncommon Background", "uncommon"),
  ];
  const rares = [
    card({ name: "Plain Rare", rarity: "rare" }),
    legend("Rare Legend", "rare"),
    background("Rare Background", "rare"),
  ];
  const mythics = [card({ name: "Plain Mythic", rarity: "mythic" }), legend("Mythic Legend", "mythic")];
  const piper = [
    card({ name: "The Prismatic Piper", rarity: "common", type_line: "Legendary Creature — Shapeshifter" }),
    card({ name: "Not The Piper", rarity: "common" }),
  ];
  const etched = [legend("Etched Legend", "mythic"), card({ name: "Etched Nonlegend", rarity: "rare" })];
  return { commons, uncommons, rares, mythics, piper, etched };
}

function commanderRoutes(code: string, o: { booster?: Card[]; rares?: Card[] } = {}) {
  const f = commanderFixture();
  const s = `s:${code} -is:promo`;
  const all = [...f.commons, ...f.uncommons, ...f.rares, ...f.mythics];
  const search: Record<string, Card[]> = {
    [poolQuery(`${s} r:common -t:basic`)]: f.commons,
    [poolQuery(`${s} r:uncommon -t:basic`)]: f.uncommons,
    [poolQuery(`${s} r:rare -t:basic`)]: o.rares ?? f.rares,
    [poolQuery(`${s} r:mythic -t:basic`)]: f.mythics,
    [poolQuery(`${s} is:booster -t:basic`)]: o.booster ?? all,
    [poolQuery(`s:${code} !"The Prismatic Piper"`)]: f.piper,
    [poolQuery(`set:spg`)]: [card({ name: "Guest", rarity: "rare" })],
  };
  if (code === "cmr") search[poolQuery(`s:${code} is:etched`)] = f.etched;
  return { search, sets: { [code]: { code, name: code.toUpperCase(), released_at: "2020-11-20" } } };
}

/* -------------------------------------------------------------------------
 * Running both implementations
 * ---------------------------------------------------------------------- */

interface Routes {
  search: Record<string, Card[]>;
  sets: Record<string, ScryfallSet>;
}

async function bothPlay(code: string, routes: Routes, pageSize?: number) {
  const oldFake = fakeScryfall({ ...routes, pageSize });
  const newFake = fakeScryfall({ ...routes, pageSize });
  const legacy = loadLegacyScryfall({ fetch: oldFake.fetch });
  const pools = createScryfallPools(
    createScryfallClient({ fetch: newFake.fetch, requestGapMs: 0, sleep: async () => {} }),
  );
  const [oldPools, newPools] = await Promise.all([
    legacy.loadPlayPools(code),
    pools.loadPlayPools(code),
  ]);
  return { oldFake, newFake, oldPools, newPools };
}

async function bothCommander(code: string, routes: Routes) {
  const oldFake = fakeScryfall(routes);
  const newFake = fakeScryfall(routes);
  const legacy = loadLegacyScryfall({ fetch: oldFake.fetch });
  const pools = createScryfallPools(
    createScryfallClient({ fetch: newFake.fetch, requestGapMs: 0, sleep: async () => {} }),
  );
  const [oldPools, newPools] = await Promise.all([
    legacy.loadCommanderPools(code),
    pools.loadCommanderPools(code),
  ]);
  return { oldFake, newFake, oldPools, newPools };
}

const sorted = (a: string[]) => [...a].sort();

function expectSameRequests(a: ReturnType<typeof fakeScryfall>, b: ReturnType<typeof fakeScryfall>) {
  expect(a.unknown, "old issued an unrecognised query").toEqual([]);
  expect(b.unknown, "new issued an unrecognised query").toEqual([]);
  expect(sorted(b.queries)).toEqual(sorted(a.queries));
  expect(sorted(b.paths)).toEqual(sorted(a.paths));
}

/* -------------------------------------------------------------------------
 * Tests
 * ---------------------------------------------------------------------- */

describe("loadPlayPools parity", () => {
  it("issues the same queries and builds the same pools", async () => {
    const { oldFake, newFake, oldPools, newPools } = await bothPlay("dsk", playRoutes("dsk"));
    expectSameRequests(oldFake, newFake);
    expect(normPools(newPools)).toEqual(normPools(oldPools));
  });

  it("pulls the set's common dual lands out of the common sheet", async () => {
    const { newPools } = await bothPlay("dsk", playRoutes("dsk"));
    const commonNames = Array.from(newPools.commons.keys());
    expect(commonNames).not.toContain("Dual Land");
    // A common land that is not a dual stays on the common sheet.
    expect(commonNames).toContain("Terramorphic");
    expect(Array.from(newPools.landDuals.keys())).toEqual(["Dual Land"]);
    expect(Array.from(newPools.landBasics.keys()).sort()).toEqual(["Island", "Plains"]);
    expect(newPools.meta.landSlotOnly).toBe(1);
  });

  it("keeps only Special Guests sharing the set's release date", async () => {
    const { oldPools, newPools } = await bothPlay("dsk", playRoutes("dsk"));
    expect(Array.from(newPools.spg.keys())).toEqual(["Guest Own"]);
    expect(Array.from(newPools.spgAll.keys()).sort()).toEqual(["Guest Other", "Guest Own"]);
    expect(newPools.meta.ownSpg).toBe(1);
    expect(normPools(newPools)).toEqual(normPools(oldPools));
  });

  it("falls back to every Special Guest when the set has no metadata", async () => {
    const routes = playRoutes("dsk", { set: null });
    const { oldFake, newFake, oldPools, newPools } = await bothPlay("dsk", routes);
    expectSameRequests(oldFake, newFake);
    expect(Array.from(newPools.spg.keys()).sort()).toEqual(["Guest Other", "Guest Own"]);
    expect(newPools.meta.ownSpg).toBe(0);
    expect(normPools(newPools)).toEqual(normPools(oldPools));
  });

  it("keeps every card when the set has no is:booster data", async () => {
    const routes = playRoutes("dsk", { booster: [] });
    const { oldFake, newFake, oldPools, newPools } = await bothPlay("dsk", routes);
    expectSameRequests(oldFake, newFake);
    expect(newPools.meta.boosterFiltered).toBe(false);
    // "Common One" was only excluded by the booster filter, so it is back.
    expect(Array.from(newPools.commons.keys())).toContain("Common One");
    expect(normPools(newPools)).toEqual(normPools(oldPools));
  });

  /*
   * The Play loader's fallback: if filtering by is:booster would empty a
   * rarity entirely, the unfiltered list is kept, because an empty rarity
   * breaks a guaranteed slot. The Commander loader deliberately does not do
   * this — asserted below.
   */
  it("keeps a rarity the booster filter would have emptied", async () => {
    const f = playFixture();
    const routes = playRoutes("dsk", { booster: [...f.commons, ...f.rares, ...f.mythics] });
    const { oldFake, newFake, oldPools, newPools } = await bothPlay("dsk", routes);
    expectSameRequests(oldFake, newFake);
    expect(newPools.uncommons.size).toBe(2);
    expect(normPools(newPools)).toEqual(normPools(oldPools));
  });

  it("follows next_page so a big set is not cut off", async () => {
    const routes = playRoutes("dsk");
    // One card per page forces every query to paginate.
    const paged = await bothPlay("dsk", routes, 1);
    expectSameRequests(paged.oldFake, paged.newFake);
    expect(normPools(paged.newPools)).toEqual(normPools(paged.oldPools));
    // Paginating must not lose or duplicate anything: the pools are identical
    // to the same fixture served in a single page.
    const single = await bothPlay("dsk", routes);
    expect(normPools(paged.newPools)).toEqual(normPools(single.newPools));
    // And the fixture really is bigger than one page, or this proves nothing.
    expect(routes.search[poolQuery("s:dsk -is:promo r:common -t:basic")].length)
      .toBeGreaterThan(1);
  });

  it("throws the same error for a set with no rares", async () => {
    const routes = playRoutes("zzz", { rares: [] });
    const oldFake = fakeScryfall(routes);
    const newFake = fakeScryfall(routes);
    const legacy = loadLegacyScryfall({ fetch: oldFake.fetch });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: newFake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    const oldErr = await legacy.loadPlayPools("zzz").catch((e: Error) => e.message);
    const newErr = await pools.loadPlayPools("zzz").catch((e: Error) => e.message);
    expect(newErr).toBe(oldErr);
    expect(newErr).toBe('Set "ZZZ" not found (no rares).');
  });
});

describe("loadCommanderPools parity", () => {
  for (const code of ["cmr", "clb", "cmm"]) {
    it(`issues the same queries and builds the same pools for ${code}`, async () => {
      const { oldFake, newFake, oldPools, newPools } = await bothCommander(
        code,
        commanderRoutes(code),
      );
      expectSameRequests(oldFake, newFake);
      expect(normPools(newPools)).toEqual(normPools(oldPools));
    });
  }

  it("asks for etched legends only for Commander Legends", async () => {
    const cmr = await bothCommander("cmr", commanderRoutes("cmr"));
    expect(cmr.newFake.queries.some((q) => q.includes("is:etched"))).toBe(true);
    expect(cmr.newPools.etched.size).toBe(1);

    const clb = await bothCommander("clb", commanderRoutes("clb"));
    expect(clb.newFake.queries.some((q) => q.includes("is:etched"))).toBe(false);
    expect(clb.newPools.etched.size).toBe(0);
  });

  it("splits legends, Backgrounds and the Piper out of the plain pools", async () => {
    const { newPools } = await bothCommander("cmr", commanderRoutes("cmr"));
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
    const f = commanderFixture();
    const routes = commanderRoutes("cmr", {
      booster: [...f.commons, ...f.rares, ...f.mythics],
    });
    const { oldFake, newFake, oldPools, newPools } = await bothCommander("cmr", routes);
    expectSameRequests(oldFake, newFake);
    expect(newPools.uncommons.size).toBe(0);
    expect(newPools.legU.size).toBe(0);
    expect(normPools(newPools)).toEqual(normPools(oldPools));
  });

  it("throws the same error for a set with no rares", async () => {
    const routes = commanderRoutes("cmr", { rares: [] });
    const oldFake = fakeScryfall(routes);
    const newFake = fakeScryfall(routes);
    const legacy = loadLegacyScryfall({ fetch: oldFake.fetch });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: newFake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    const oldErr = await legacy.loadCommanderPools("cmr").catch((e: Error) => e.message);
    const newErr = await pools.loadCommanderPools("cmr").catch((e: Error) => e.message);
    expect(newErr).toBe(oldErr);
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
    const tokens = [card({ name: "Spirit", collector_number: "6" })];
    const fake = fakeScryfall({ search: { [poolQuery("set:tdsk")]: tokens } });
    const oldFake = fakeScryfall({ search: { [poolQuery("set:tdsk")]: tokens } });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    const legacy = loadLegacyScryfall({ fetch: oldFake.fetch });
    expect(await pools.loadTokens("DSK")).toEqual(await legacy.loadTokens("DSK"));
    expect(fake.queries).toEqual(oldFake.queries);
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
    const cycle = { id: "shock", label: "Shock lands", names: ["Steam Vents", "Blood Crypt"] };
    const cards = [card({ name: "Steam Vents" }), card({ name: "Blood Crypt" })];
    const q = poolQuery(
      '(!"Steam Vents" or !"Blood Crypt") game:paper -is:promo -border:gold -is:oversized',
    );
    const fake = fakeScryfall({ search: { [q]: cards } });
    const oldFake = fakeScryfall({ search: { [q]: cards } });
    const pools = createScryfallPools(
      createScryfallClient({ fetch: fake.fetch, requestGapMs: 0, sleep: async () => {} }),
    );
    const legacy = loadLegacyScryfall({ fetch: oldFake.fetch });
    expect(normPools({ m: await pools.loadCycle(cycle) })).toEqual(
      normPools({ m: await legacy.loadCycle(cycle) }),
    );
    expect(fake.queries).toEqual(oldFake.queries);
    expect(fake.unknown).toEqual([]);
  });
});
