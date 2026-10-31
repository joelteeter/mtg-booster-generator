/*
 * Running one generation with the ported code.
 *
 * This is the app's own sequence with the DOM taken out: load the pools, build
 * the spec, prepare the separator, generate, then word the status line. It
 * lives here because two suites need it — the sweep that checks the packs
 * against the old app's, and the one that checks the download buttons, which
 * needs some packs to export.
 */
import { QueryClient } from "@tanstack/react-query";

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
  prepareBonus,
  prepareTokenSeparator,
  type BonusPicker,
  type TokenSeparatorPicker,
} from "@/lib/generate";
import { specOptions } from "@/lib/options";
import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import { scryfallQueries } from "@/lib/scryfall/queries";

import { fakeScryfall } from "./fake-scryfall";
import {
  DEFAULTS,
  PLAY_SELECTION,
  mulberry32,
  random,
  search,
  sets,
} from "./generate-fixtures";
import type { Scenario } from "./generate-scenarios";

export function fakeFor(scenario: Scenario) {
  return fakeScryfall({ search, sets, random, ...scenario.fake });
}

export async function runPorted(scenario: Scenario) {
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
