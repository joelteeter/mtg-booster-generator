"use client";

/*
 * Everything the slot panel needs, derived from the store and the loaded pools.
 *
 * This is the port of `getOpts` + `buildSpec` + the top of `renderExplain` in
 * the old `js/ui.js`. Keeping it in one hook means the panel, the set info line
 * and (in phase 4) the generator all read the same spec rather than each
 * rebuilding it.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  commanderSpec,
  diffFromVanilla,
  playSpec,
  statsFromPools,
} from "@/lib/booster";
import type { CommanderLayout, Slot, Stats } from "@/lib/booster/types";
import { collapseChanges, vanillaOpts, type CollapsedChange } from "@/lib/explain";
import { specOptions, type SpecOptions } from "@/lib/options";
import type { CommanderPools, PlayPools } from "@/lib/scryfall/pools";
import {
  selectCode,
  selectLayout,
  selectOptions,
  useOptionsStore,
  type Mode,
} from "@/store/options";

import { useDebounced } from "./use-debounced";
import { queries, useSetsByCode } from "./use-scryfall";

export type { SpecOptions };

export interface SpecResult {
  mode: Mode;
  code: string;
  layout: CommanderLayout | null;
  opts: SpecOptions;
  stats: Stats | null;
  pools: PlayPools | CommanderPools | null;
  slots: Slot[];
  /**
   * The same slots for a different set of pool sizes.
   *
   * Generate needs this: it fetches the pools itself, so that pressing it
   * before they have arrived builds the spec from the real counts rather than
   * from the nulls the panel is showing. It is the old `freshOpts` rebuild.
   */
  buildSlots: (stats: Stats | null) => Slot[];
  /** Null in vanilla mode: there is nothing to compare against. */
  vanillaSlots: Slot[] | null;
  diffs: CollapsedChange[][];
  diffCount: number;
  /** True while this set's pools are being fetched. */
  loading: boolean;
  error: Error | null;
}

export function useSpec(): SpecResult {
  const mode = useOptionsStore((s) => s.mode);
  const noFoils = useOptionsStore((s) => s.noFoils);
  const selection = useOptionsStore((s) => s.selection);
  const options = useOptionsStore(selectOptions);
  const setsByCode = useSetsByCode();

  const code = selectCode({ mode, selection });
  const layout = selectLayout({ mode, selection });

  /*
   * The code is debounced before it reaches a query, so typing "dsk" loads one
   * set's pools rather than three. The spec itself still re-renders at once.
   */
  const settledCode = useDebounced(code, 350);

  const playQuery = useQuery({
    ...queries.playPools(settledCode),
    enabled: mode === "play" && !!settledCode,
  });
  const commanderQuery = useQuery({
    ...queries.commanderPools(settledCode),
    enabled: mode === "commander" && !!settledCode,
  });
  const active = mode === "play" ? playQuery : commanderQuery;

  // Pools belonging to a different set than the one now chosen are ignored, so
  // the panel never shows one set's counts under another's name.
  const pools = settledCode === code ? (active.data ?? null) : null;

  const released = setsByCode.get(code)?.released_at ?? null;

  const opts: SpecOptions = useMemo(
    () => specOptions({ mode, options, released, noFoils }),
    [options, released, mode, noFoils],
  );

  return useMemo(() => {
    const stats = pools ? statsFromPools(pools) : null;
    const buildWith = (o: SpecOptions, s: Stats | null) =>
      mode === "play"
        ? playSpec(o, s)
        : commanderSpec(layout ?? "cmr", o, s);
    const build = (o: SpecOptions) => buildWith(o, stats);

    const slots = build(opts);
    // Same set, same card counts, official odds: anything that differs is down
    // to the options chosen on this tab.
    const vanillaSlots = opts.vanilla ? null : build(vanillaOpts(opts));
    const diffs = diffFromVanilla(slots, vanillaSlots).map(collapseChanges);

    return {
      mode,
      code,
      layout,
      opts,
      stats,
      pools,
      slots,
      buildSlots: (s: Stats | null) => buildWith(opts, s),
      vanillaSlots,
      diffs,
      diffCount: diffs.reduce((a, c) => a + c.length, 0),
      loading: !!settledCode && active.isFetching && !pools,
      error: (active.error as Error) ?? null,
    };
  }, [
    mode,
    code,
    layout,
    opts,
    pools,
    settledCode,
    active.isFetching,
    active.error,
  ]);
}
