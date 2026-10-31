/*
 * Generating packs, against values recorded from the old app.
 *
 * Until phase 6 both implementations ran against the same fake Scryfall with
 * the same seeded random source, and every random decision was taken in the
 * same order, so the packs matched printing for printing. The old app is gone;
 * `tests/golden/generate.txt` holds what it drew.
 *
 * What one run covers: the pool loading, the spec, the outcome draw, the "no
 * repeated names in a pack" rule, the alternate-treatment preference, the
 * Guest List swap, God Packs, The List (including its fallback), the separator
 * lands and token separators, the token sheets, every CSV row, the filenames
 * and the status line.
 */
import { describe, expect, it } from "vitest";

import { godPackSpec, playSpec, statsFromPools } from "@/lib/booster";
import {
  generatePacks,
  generateStatus,
  prepareBonus,
  previewOptionLabel,
} from "@/lib/generate";
import { specOptions } from "@/lib/options";
import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import type { Card } from "@/lib/scryfall/types";

import { fakeScryfall } from "./fake-scryfall";
import { DEFAULTS, mulberry32, random, search, sets } from "./generate-fixtures";
import { runPorted } from "./generate-run";
import { SCENARIOS, asLines, normPacks } from "./generate-scenarios";
import { golden, readGolden } from "./goldens";
import { renderCalls, renderValue } from "./render";

const recorded = readGolden("generate");

/**
 * Runs one scenario and checks the whole run against what the old app did:
 * the options read off the form, every card drawn, the CSV files, the
 * filenames, the status line, every progress message, and the queries put to
 * Scryfall.
 */
async function check(name: string) {
  const ported = await runPorted(SCENARIOS[name]);
  expect(ported.status, `${name}: the run failed`).toMatch(/^✅/);
  expect(ported.result.packs.length).toBeGreaterThan(0);
  expect(
    renderValue({
      opts: ported.opts,
      packs: normPacks(ported.result.packs),
      exportFiles: asLines(ported.result.exportFiles),
      status: ported.status,
      statusHistory: ported.statusHistory,
      queries: [...ported.fake.queries].sort(),
      unknown: ported.fake.unknown,
    }),
  ).toBe(golden(recorded, `run ${name}`));
  return { ported };
}

describe("generate parity", () => {
  it("vanilla Booster Packs with a built-in land separator", async () => {
    await check("vanilla");
  });

  it("fun options: x3, foil toggle, List toggle, Guest List", async () => {
    const { ported } = await check("fun");
    // The List fires often enough at x3 that the scenario is worth having.
    expect(ported.opts.listEra).toBe(true);
  });

  it("a fetched separator cycle (shock lands)", async () => {
    await check("shock");
  });

  it("a token separator and token sheets", async () => {
    const { ported } = await check("tokens");
    expect(ported.result.tokenSheetCount).toBeGreaterThan(0);
  });

  it("no separator at all", async () => {
    await check("no-separator");
  });

  it("The List failing falls back to a common", async () => {
    await check("list-404");
  });

  it("Commander Masters, the official layout", async () => {
    await check("cmm");
  });

  it("Commander: a borrowed layout names the file after it", async () => {
    const { ported } = await check("cmm-any");
    expect(ported.result.exportFiles.base[0]).toBe(
      "CMM-AllCommanderBoosters-CMMLayout-1",
    );
  });

  it("God Packs: every slot rare or mythic", async () => {
    /*
     * The God Pack roll is the first draw of each pack, so a source that
     * opens below 1-in-1,000 and behaves normally afterwards forces one
     * without touching anything else.
     */
    const forced = (seed: number) => {
      const base = mulberry32(seed);
      let first = true;
      return () => {
        if (first) {
          first = false;
          return 0.0001;
        }
        return base();
      };
    };
    const options = { ...DEFAULTS, packCount: 1 };
    const fake = fakeScryfall({ search, sets, random });
    const client = createScryfallClient({
      fetch: fake.fetch,
      requestGapMs: 0,
      sleep: async () => {},
    });
    const pools = createScryfallPools(client);
    const rng = forced(21);
    const opts = specOptions({
      mode: "play",
      options,
      released: sets.dsk.released_at ?? null,
    });
    const loaded = await pools.loadPlayPools("dsk");
    const stats = statsFromPools(loaded);
    const bonusPick = await prepareBonus(opts.bonusType, {
      loadCycle: (c) => pools.loadCycle(c),
      rng,
    });
    const result = await generatePacks({
      setCode: "DSK",
      mode: "play",
      layoutTag: "",
      packCount: 1,
      opts,
      pools: loaded,
      slots: playSpec(opts, stats),
      godSlots: godPackSpec(stats),
      rng,
      bonusPick,
      separatorIsToken: false,
      fetchList: () => client.fetchRandom("set:plst"),
      log: () => {},
    });
    const status = generateStatus({
      packCount: 1,
      mode: "play",
      vanilla: false,
      packs: result.packs,
      tokenSheetCount: 0,
    });
    expect(status).toContain("✨ 1 God Pack");
    expect(result.packs[0].godPack).toBe(true);
    expect(
      renderValue({
        packs: normPacks(result.packs),
        status,
        // The dropdown marks a God Pack with a ✨; nothing else here does.
        previewLabels: result.packs.map(previewOptionLabel),
      }),
    ).toBe(golden(recorded, "godpack"));
  });
});

describe("the preview's images", () => {
  it("builds the same faces and sides the old preview did", async () => {
    const { ported } = await check("preview");
    const entries = ported.result.packs.flatMap((p) => p.cards);

    const { cardSides, faceImages } = await import("@/lib/preview");
    expect(renderCalls(entries.map((entry) => cardSides(entry)))).toBe(
      golden(recorded, "preview sides"),
    );
    /*
     * Every size, including ones a card does not carry: both the old code and
     * this return `undefined` for those, and the port keeps that rather than
     * tidying it into "" — a card with no image at that size is a data
     * problem, and an empty src would hide it.
     */
    for (const size of ["small", "normal", "large", "png"] as const) {
      expect(
        renderCalls(entries.map((e) => faceImages(e.card as Card, size))),
      ).toBe(golden(recorded, `preview faces ${size}`));
    }
  });
});
