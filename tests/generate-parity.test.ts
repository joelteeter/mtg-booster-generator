/*
 * Generate, old against new, card for card.
 *
 * This is the one part of the app that can be compared exactly. Both
 * implementations get the same fake Scryfall and the same seeded random
 * source, and every random decision is taken in the same order, so the packs
 * either match printing for printing or the port is wrong.
 *
 * What that covers in one sweep: the pool loading, the spec, the outcome draw,
 * the "no repeated names in a pack" rule, the alternate-treatment preference,
 * the Guest List swap, God Packs, The List (including its fallback), the
 * separator lands and token separators, the token sheets, every CSV row, the
 * filenames and the status line.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  commanderSpec,
  godPackSpec,
  playSpec,
  statsFromPools,
} from "@/lib/booster";
import type { CommanderLayout, Slot, Stats } from "@/lib/booster/types";
import {
  generatePacks,
  generateStatus,
  previewOptionLabel,
  prepareBonus,
  prepareTokenSeparator,
  type BonusPicker,
  type TokenSeparatorPicker,
} from "@/lib/generate";
import { specOptions } from "@/lib/options";
import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import { scryfallQueries } from "@/lib/scryfall/queries";
import type { Card } from "@/lib/scryfall/types";
import type { SetSelection, TabOptions } from "@/store/options";

import { fakeScryfall, type FakeOptions } from "./fake-scryfall";
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

interface Scenario {
  mode: "play" | "commander";
  selection?: Partial<SetSelection>;
  options?: Partial<TabOptions>;
  seed: number;
  /** Override the fake, e.g. to make The List 404. */
  fake?: Partial<FakeOptions>;
  /** Queries the fake is expected not to recognise, for the 404 paths. */
  allowUnknown?: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Both pack shapes reduced to the same comparable thing. */
function normPacks(packs: any[]): unknown {
  return packs.map((p) => ({
    godPack: !!p.godPack,
    tokenSheet: p.tokenSheet ?? null,
    cards: (p.cards ?? p).map((e: any) => ({
      id: e.card?.id ?? null,
      back: e.backCard?.id ?? null,
      finish: e.finish,
      slot: e.slot ?? null,
      label: e.label,
      bonus: !!e.bonus,
      tokenSlot: !!e.tokenSlot,
      filler: !!e.filler,
    })),
  }));
}

function fakeFor(scenario: Scenario) {
  return fakeScryfall({ search, sets, random, ...scenario.fake });
}

async function runLegacy(scenario: Scenario) {
  const selection = { ...PLAY_SELECTION, ...scenario.selection };
  const options = { ...DEFAULTS, ...scenario.options };
  const fake = fakeFor(scenario);
  const app = loadLegacyApp({
    fetch: fake.fetch,
    random: mulberry32(scenario.seed),
    mode: scenario.mode,
    controls: controlsFor(selection, options),
  });
  const run = await app.run();
  return { run, app, fake };
}

async function runPorted(scenario: Scenario) {
  const selection = { ...PLAY_SELECTION, ...scenario.selection };
  const options = { ...DEFAULTS, ...scenario.options };
  const fake = fakeFor(scenario);
  const client = createScryfallClient({
    fetch: fake.fetch,
    requestGapMs: 0,
    sleep: async () => {},
    onNotice: () => {},
  });
  const pools = createScryfallPools(client);
  /*
   * The same caching layer the app uses. It is not an optimisation here: the
   * old `tokenCache` meant a token separator and the token sheets shared one
   * fetch, and without Query in the way the port would ask twice.
   */
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const queries = scryfallQueries({
    pools,
    getSets: () => client.getSets(),
    searchCards: (query, unique) => client.search(query, { unique }),
  });
  const fetchTokens = (c: string) => queryClient.fetchQuery(queries.tokens(c));
  const rng = mulberry32(scenario.seed);

  const mode = scenario.mode;
  const code =
    mode === "commander"
      ? selection.cmdSource === "any"
        ? (selection.cmdAnyCustom.trim() || selection.cmdAnySetSelect).toLowerCase()
        : selection.cmdSetSelect
      : (selection.customSet.trim() || selection.setSelect).toLowerCase();
  const setCode = code.toUpperCase();
  const cmdAny = mode === "commander" && selection.cmdSource === "any";
  const layout: CommanderLayout | null =
    mode === "commander"
      ? cmdAny
        ? selection.cmdLayout
        : (selection.cmdSetSelect as CommanderLayout)
      : null;

  const released = sets[code]?.released_at ?? null;
  const opts = specOptions({ mode, options, released });

  const statusHistory: string[] = [`⏳ Pulling data for ${setCode}...`];
  const loaded =
    mode === "play"
      ? await pools.loadPlayPools(code)
      : await pools.loadCommanderPools(code);
  const stats: Stats = statsFromPools(loaded);
  const slots: Slot[] =
    mode === "play"
      ? playSpec(opts, stats)
      : commanderSpec(layout ?? "cmr", opts, stats);
  const godSlots = mode === "play" ? godPackSpec(stats) : null;

  let bonusPick: BonusPicker | TokenSeparatorPicker | null = null;
  const separatorIsToken = opts.separatorType === "token";
  if (opts.includeBonus) {
    statusHistory.push(
      separatorIsToken
        ? `⏳ Loading ${setCode} tokens...`
        : `⏳ Loading bonus lands...`,
    );
    bonusPick = separatorIsToken
      ? await prepareTokenSeparator(code, { loadTokens: fetchTokens, rng })
      : await prepareBonus(opts.bonusType, {
          loadCycle: (c) => pools.loadCycle(c),
          rng,
          onWarn: () => {},
        });
  }

  const result = await generatePacks({
    setCode,
    mode,
    layoutTag: cmdAny && layout ? `-${layout.toUpperCase()}Layout` : "",
    packCount: options.packCount,
    opts,
    pools: loaded,
    slots,
    godSlots,
    rng,
    bonusPick,
    separatorIsToken,
    loadTokens: () => fetchTokens(code),
    fetchList: () => client.fetchRandom("set:plst"),
    onStatus: (m) => statusHistory.push(m),
    log: () => {},
    onWarn: () => {},
  });

  const status = generateStatus({
    packCount: options.packCount,
    mode,
    vanilla: opts.vanilla,
    packs: result.packs,
    tokenSheetCount: result.tokenSheetCount,
  });
  statusHistory.push(status);

  return { result, status, statusHistory, opts, fake };
}

async function compare(name: string, scenario: Scenario) {
  const legacy = await runLegacy(scenario);
  const ported = await runPorted(scenario);

  // A generation that failed would compare equal as two empty runs.
  expect(legacy.run.status, `${name}: legacy run failed`).toMatch(/^✅/);
  expect(legacy.run.packs.length).toBeGreaterThan(0);

  expect(ported.opts, `${name}: options`).toEqual(legacy.app.getOpts());
  expect(normPacks(ported.result.packs), `${name}: packs`).toEqual(
    normPacks(legacy.run.packs),
  );
  expect(ported.result.exportFiles, `${name}: files`).toEqual(
    legacy.run.exportFiles,
  );
  expect(ported.status, `${name}: status`).toBe(legacy.run.status);
  expect(ported.statusHistory, `${name}: progress`).toEqual(
    legacy.run.statusHistory,
  );
  // Both must have asked Scryfall for exactly the same things.
  const allowUnknown = scenario.allowUnknown ?? [];
  expect(ported.fake.unknown, `${name}: unknown queries (new)`).toEqual(
    allowUnknown,
  );
  expect(legacy.fake.unknown, `${name}: unknown queries (old)`).toEqual(
    allowUnknown,
  );
  expect([...ported.fake.queries].sort()).toEqual(
    [...legacy.fake.queries].sort(),
  );
  return { legacy, ported };
}

describe("generate parity", () => {
  it("vanilla Booster Packs with a built-in land separator", async () => {
    await compare("vanilla", {
      mode: "play",
      seed: 1,
      // A non-default multiplier that vanilla mode has to ignore.
      options: { vanilla: true, mult: 4, packCount: 3 },
    });
  });

  it("fun options: x3, foil toggle, List toggle, Guest List", async () => {
    const { ported } = await compare("fun", {
      mode: "play",
      seed: 7,
      options: {
        mult: 3,
        foilToggle: true,
        listToggle: true,
        preferGuestList: true,
        packCount: 6,
      },
    });
    // The List fires often enough at x3 that the scenario is worth having.
    expect(ported.opts.listEra).toBe(true);
  });

  it("a fetched separator cycle (shock lands)", async () => {
    await compare("shock", {
      mode: "play",
      seed: 11,
      options: { bonusType: "shock" },
    });
  });

  it("a token separator and token sheets", async () => {
    const { ported } = await compare("tokens", {
      mode: "play",
      seed: 3,
      options: { separatorType: "token", tokenSheets: true, packCount: 2 },
    });
    expect(ported.result.tokenSheetCount).toBeGreaterThan(0);
  });

  it("no separator at all", async () => {
    await compare("no-separator", {
      mode: "play",
      seed: 5,
      options: { includeBonus: false },
    });
  });

  it("The List failing falls back to a common", async () => {
    await compare("list-404", {
      mode: "play",
      seed: 7,
      options: { mult: 5, listToggle: true, packCount: 3 },
      fake: { random: {} },
      allowUnknown: ["set:plst"],
    });
  });

  it("Commander Masters, the official layout", async () => {
    await compare("cmm", {
      mode: "commander",
      seed: 13,
      selection: { cmdSetSelect: "cmm" },
      options: { packCount: 2 },
    });
  });

  it("Commander: a borrowed layout names the file after it", async () => {
    const { ported } = await compare("cmm-any", {
      mode: "commander",
      seed: 17,
      selection: { cmdSource: "any", cmdAnyCustom: "cmm", cmdLayout: "cmm" },
      options: { packCount: 1 },
    });
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
    const selection = PLAY_SELECTION;
    const options = { ...DEFAULTS, packCount: 1 };
    const fake = fakeScryfall({ search, sets, random });
    const app = loadLegacyApp({
      fetch: fake.fetch,
      random: forced(21),
      mode: "play",
      controls: controlsFor(selection, options),
    });
    const run = await app.run();
    expect(run.status).toContain("✨ 1 God Pack");
    expect(run.packs[0].godPack).toBe(true);

    const fake2 = fakeScryfall({ search, sets, random });
    const client = createScryfallClient({
      fetch: fake2.fetch,
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
    expect(normPacks(result.packs)).toEqual(normPacks(run.packs));
    // The dropdown marks a God Pack with a ✨; nothing else in the sweep does.
    expect(result.packs.map(previewOptionLabel)).toEqual(
      [...run.previewSelectHtml.matchAll(/<option value="\d+">([^<]*)<\/option>/g)].map(
        (m) => m[1],
      ),
    );
    expect(
      generateStatus({
        packCount: 1,
        mode: "play",
        vanilla: false,
        packs: result.packs,
        tokenSheetCount: 0,
      }),
    ).toBe(run.status);
  });
});

describe("the preview's images", () => {
  it("matches the old faceImages and cardSides", async () => {
    const { legacy, ported } = await compare("preview", {
      mode: "play",
      seed: 23,
      options: { separatorType: "token", tokenSheets: true, packCount: 2 },
    });
    const entries = ported.result.packs.flatMap((p) => p.cards);
    const legacyEntries = legacy.run.packs.flatMap((p) => [...p]);
    expect(entries.length).toBe(legacyEntries.length);

    const { cardSides, faceImages } = await import("@/lib/preview");
    entries.forEach((entry, i) => {
      const old = legacyEntries[i];
      expect(cardSides(entry), `sides of entry ${i}`).toEqual(
        legacy.app.cardSides(old),
      );
      // Every size, including ones a card does not carry: both return
      // `undefined` for those, and the port keeps that rather than tidying it
      // into "" — a card with no image at that size is a data problem, and an
      // empty src would hide it.
      (["small", "normal", "large", "png"] as const).forEach((size) => {
        expect(faceImages(entry.card as Card, size)).toEqual(
          legacy.app.faceImages(old.card, size),
        );
      });
    });
  });
});
