"use client";

/*
 * Pressing Generate.
 *
 * This is the part of `js/generate.js`'s click handler that was not pure: the
 * order the data is fetched in, the status messages along the way, and what
 * happens when something fails. The generation itself is
 * `lib/generate/generate.ts`, which is deterministic given its `Rng`.
 *
 * The fetches go through `queryClient.fetchQuery`, not `useQuery`: a bonus
 * land cycle is only needed at the moment Generate is pressed, and a hook
 * would have to load every cycle on every render to have it ready. Going
 * through Query rather than the client directly still means a second run over
 * the same cycle costs no requests.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { godPackSpec, statsFromPools } from "@/lib/booster";
import {
  generatePacks,
  generateStatus,
  prepareBonus,
  prepareTokenSeparator,
  type BonusPicker,
  type TokenSeparatorPicker,
} from "@/lib/generate";
import { useExportStore } from "@/store/export";
import { usePacksStore } from "@/store/packs";
import {
  isCommanderAny,
  selectOptions,
  useOptionsStore,
} from "@/store/options";

import { client, queries } from "./use-scryfall";
import { useSpec } from "./use-spec";

export interface GenerateHandle {
  run: () => Promise<void>;
  generating: boolean;
  /** False until a set is chosen, as the old button was never disabled. */
  ready: boolean;
}

export function useGenerate(): GenerateHandle {
  const spec = useSpec();
  const queryClient = useQueryClient();
  const packCount = useOptionsStore((s) => selectOptions(s).packCount);
  const cmdAny = useOptionsStore(isCommanderAny);
  const generating = usePacksStore((s) => s.generating);
  const begin = usePacksStore((s) => s.begin);
  const progress = usePacksStore((s) => s.progress);
  const finish = usePacksStore((s) => s.finish);
  const fail = usePacksStore((s) => s.fail);

  const run = useCallback(async () => {
    const { code, mode, opts, layout } = spec;
    if (!code) {
      progress("❌ Pick a set first.");
      return;
    }
    const setCode = code.toUpperCase();
    const rng = Math.random;

    begin(`⏳ Pulling data for ${setCode}...`);
    // The old handler cleared `#exportStatus` here too.
    useExportStore.getState().setStatus("");
    try {
      /*
       * The pools are fetched here rather than read off the panel, so pressing
       * Generate while they are still loading builds the spec from the real
       * counts. This is the old `freshOpts` rebuild.
       */
      const loaded =
        mode === "play"
          ? await queryClient.fetchQuery(queries.playPools(code))
          : await queryClient.fetchQuery(queries.commanderPools(code));
      const stats = statsFromPools(loaded);
      const slots = spec.buildSlots(stats);
      // Play Boosters only: Commander draft boosters are not Booster Packs.
      const godSlots = mode === "play" ? godPackSpec(stats, opts.noFoils) : null;

      let bonusPick: BonusPicker | TokenSeparatorPicker | null = null;
      const separatorIsToken = opts.separatorType === "token";
      if (opts.includeBonus) {
        progress(
          separatorIsToken
            ? `⏳ Loading ${setCode} tokens...`
            : `⏳ Loading bonus lands...`,
        );
        bonusPick = separatorIsToken
          ? await prepareTokenSeparator(code, {
              loadTokens: (c) => queryClient.fetchQuery(queries.tokens(c)),
              rng,
              noFoils: opts.noFoils,
            })
          : await prepareBonus(opts.bonusType, {
              loadCycle: (c) => queryClient.fetchQuery(queries.cycle(c)),
              rng,
              noFoils: opts.noFoils,
            });
      }

      const result = await generatePacks({
        setCode,
        mode,
        // Only a borrowed layout goes in the filename; an official Commander
        // set's layout is implied by its own code.
        layoutTag:
          mode === "commander" && cmdAny && layout
            ? `-${layout.toUpperCase()}Layout`
            : "",
        packCount,
        opts,
        pools: loaded,
        slots,
        godSlots,
        rng,
        bonusPick,
        separatorIsToken,
        loadTokens: () => queryClient.fetchQuery(queries.tokens(code)),
        loadLands: () => queryClient.fetchQuery(queries.lands(code)),
        fetchList: () => client.fetchRandom("set:plst"),
        onStatus: progress,
      });

      finish({
        ...result,
        status: generateStatus({
          packCount,
          mode,
          vanilla: opts.vanilla,
          packs: result.packs,
          tokenSheetCount: result.tokenSheetCount,
          landSheetCount: result.landSheetCount,
        }),
      });
    } catch (e) {
      console.error(e);
      fail(e instanceof Error ? e.message : String(e));
    }
  }, [spec, packCount, cmdAny, queryClient, begin, progress, finish, fail]);

  return { run, generating, ready: !!spec.code };
}
