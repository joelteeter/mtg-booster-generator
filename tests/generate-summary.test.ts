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
  isDfc,
  packName,
  previewOptionLabel,
  prepareTokenSeparator,
} from "@/lib/generate";
import { godPackSpec, playSpec, statsFromPools } from "@/lib/booster";
import { specOptions } from "@/lib/options";
import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";

import { fakeScryfall } from "./fake-scryfall";
import {
  DEFAULTS,
  PLAY_SELECTION,
  controlsFor,
  mulberry32,
  random,
  search,
  sets,
} from "./generate-fixtures";
import { loadLegacyApp } from "./legacy-generate";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The visible text of each `<option>`, in order. */
const optionTexts = (html: string): string[] =>
  [...html.matchAll(/<option value="\d+">([^<]*)<\/option>/g)].map((m) => m[1]);

/** The first cell of each row, with the double-faced badge flattened. */
const rowLabels = (html: string): string[] =>
  [...html.matchAll(/<td>([\s\S]*?)<\/td>/g)]
    .map((m) => m[1])
    .filter((_, i, all) => i % 5 === 0 || all.length < 5)
    .map((cell) =>
      cell
        .replace(/<span class="dfc-badge"[^>]*>\s*([^<]*)<\/span>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );

const options = {
  ...DEFAULTS,
  packCount: 3,
  mult: 5,
  separatorType: "token" as const,
  tokenSheets: true,
};

async function both() {
  const fake = fakeScryfall({ search, sets, random });
  const app = loadLegacyApp({
    fetch: fake.fetch,
    random: mulberry32(41),
    mode: "play",
    controls: controlsFor(PLAY_SELECTION, options),
  });
  const run = await app.run();

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
    godSlots: godPackSpec(stats),
    rng,
    bonusPick,
    separatorIsToken: true,
    loadTokens: async () => tokens,
    fetchList: () => client.fetchRandom("set:plst"),
    log: () => {},
  });
  return { run, app, result };
}

describe("the names of a finished run", () => {
  it("names the packs and token sheets as the old dropdown did", async () => {
    const { run, result } = await both();
    expect(result.packs.map(previewOptionLabel)).toEqual(
      optionTexts(run.previewSelectHtml),
    );
  });

  it("labels the downloads rows the same way", async () => {
    const { run, result } = await both();
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
    expect(mine).toEqual(rowLabels(run.dlRowsHtml));
  });

  it("counts and names double-faced cards as the exporter does", async () => {
    const { run, app, result } = await both();
    result.packs.forEach((p, i) => {
      expect(dfcCount(p)).toBe(app.dfcCount([...run.packs[i]]));
      expect(dfcNames(p)).toBe(
        [...run.packs[i]]
          .filter((e: any) => isDfc(e.card))
          .map((e: any) => e.card.name)
          .join(", "),
      );
    });
    // The fixture has a two-sided token, so this is not vacuous.
    expect(result.packs.some((p) => dfcCount(p) > 0)).toBe(true);
  });
});
