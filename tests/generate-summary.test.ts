/*
 * The wording around a finished run, compared against the old markup.
 *
 * The old code built these strings straight into `innerHTML`, so the only way
 * to compare them is to read the HTML back out and pull the text from it. That
 * is worth doing: the pack names, the "All 3 packs + 1 token sheet" label, the
 * ✨ on a God Pack and the ⟲ double-faced count are all prose a port can
 * quietly reword, and none of it is covered by comparing the packs themselves.
 */
import { describe, expect, it } from "vitest";

import {
  generatePacks,
  allPacksLabel,
  dfcCount,
  dfcNames,
  packName,
  previewOptionLabel,
  prepareTokenSeparator,
} from "@/lib/generate";
import { godPackSpec, playSpec, statsFromPools } from "@/lib/booster";
import { specOptions } from "@/lib/options";
import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";

import { fakeScryfall } from "./fake-scryfall";
import { golden, readGolden } from "./goldens";
import { renderCalls, renderValue } from "./render";
import {
  DEFAULTS,
  mulberry32,
  random,
  search,
  sets,
} from "./generate-fixtures";


/** The visible text of each `<option>`, in order. */
const recorded = readGolden("generate");

const options = {
  ...DEFAULTS,
  packCount: 3,
  mult: 5,
  separatorType: "token" as const,
  tokenSheets: true,
};

async function run(noFoils = false) {
  const fake2 = fakeScryfall({ search, sets, random });
  const client = createScryfallClient({
    fetch: fake2.fetch,
    requestGapMs: 0,
    sleep: async () => {},
  });
  const pools = createScryfallPools(client);
  const rng = mulberry32(41);
  const opts = specOptions({
    mode: "play",
    options,
    released: sets.dsk.released_at ?? null,
    noFoils,
  });
  const loaded = await pools.loadPlayPools("dsk");
  const stats = statsFromPools(loaded);
  const tokens = await pools.loadTokens("dsk");
  const bonusPick = await prepareTokenSeparator("dsk", {
    loadTokens: async () => tokens,
    rng,
  });
  const result = await generatePacks({
    setCode: "DSK",
    mode: "play",
    layoutTag: "",
    packCount: options.packCount,
    opts,
    pools: loaded,
    slots: playSpec(opts, stats),
    godSlots: godPackSpec(stats, noFoils),
    rng,
    bonusPick,
    separatorIsToken: true,
    loadTokens: async () => tokens,
    fetchList: () => client.fetchRandom("set:plst"),
    log: () => {},
  });
  return { result };
}

describe("the names of a finished run", () => {
  it("names the packs and token sheets as the old dropdown did", async () => {
    const { result } = await run();
    expect(renderValue(result.packs.map(previewOptionLabel))).toBe(
      golden(recorded, "summary previewLabels"),
    );
  });

  it("labels the downloads rows the same way", async () => {
    const { result } = await run();
    const mine = [
      allPacksLabel(result.packs),
      ...result.packs.map((p, i) => packName(p, i)),
    ].map((name, i) => {
      const dfc =
        i === 0
          ? result.packs.reduce((a, p) => a + dfcCount(p), 0)
          : dfcCount(result.packs[i - 1]);
      return dfc ? `${name} ⟲ ${dfc} double-faced` : name;
    });
    expect(renderValue(mine)).toBe(golden(recorded, "summary rowLabels"));
  });

  it("counts and names double-faced cards as the exporter does", async () => {
    const { result } = await run();
    expect(renderCalls(result.packs.map((p) => dfcNames(p)))).toBe(
      golden(recorded, "summary dfc names"),
    );
    expect(
      renderValue(result.packs.map((p) => ({ count: dfcCount(p) }))),
    ).toBe(golden(recorded, "summary dfc counts"));
    // The fixture has a two-sided token, so this is not vacuous.
    expect(result.packs.some((p) => dfcCount(p) > 0)).toBe(true);
  });
});

/*
 * The option's whole point, checked where it actually lands rather than on
 * the spec: the finish of every card the run produces, and the `finish`
 * column of every CSV row, which is what MTGProxyPrinter reads.
 */
describe("a run with foils switched off", () => {
  it("marks no card foil or etched, and the run with foils does", async () => {
    const plain = await run(true);
    const finishes = plain.result.packs.flatMap((pack) =>
      pack.cards.map((e) => e.finish),
    );
    expect(finishes.length).toBeGreaterThan(0);
    expect([...new Set(finishes)]).toEqual(["nonfoil"]);

    // Fun mode at x5 over three packs: the control has to contain a foil, or
    // the assertion above proves nothing.
    const normal = await run(false);
    const theirs = normal.result.packs.flatMap((pack) =>
      pack.cards.map((e) => e.finish),
    );
    expect(theirs).toContain("foil");
  });

  it("writes nonfoil in every CSV row", async () => {
    const { result } = await run(true);
    const rows = result.exportFiles.csv.flatMap((csv) =>
      csv.split("\n").slice(1),
    );
    const finishes = rows
      .filter((r) => r.trim())
      // `finish` is the 12th column, and every field before it that can hold
      // a comma is quoted, so splitting on quotes is not needed here.
      .map((r) => r.split(",").slice(-6)[0]);
    expect(finishes.length).toBeGreaterThan(0);
    expect([...new Set(finishes)]).toEqual(["nonfoil"]);
  });
});
