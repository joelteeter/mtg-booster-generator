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
  LIST_ERA_END,
  PLAY_BOOSTER_START,
  commanderSpec,
  diffFromVanilla,
  playSpec,
  statsFromPools,
} from "@/lib/booster";
import type { CommanderLayout, Slot, Stats } from "@/lib/booster/types";
import { collapseChanges, vanillaOpts, type CollapsedChange } from "@/lib/explain";
import type { CommanderPools, PlayPools } from "@/lib/scryfall/pools";
import {
  isBoosterMode,
  selectCode,
  selectLayout,
  selectOptions,
  useOptionsStore,
  type BoosterMode,
} from "@/store/options";

import { useDebounced } from "./use-debounced";
import { queries, useSetsByCode } from "./use-scryfall";

/** The options object the spec builders take. */
export interface SpecOptions {
  vanilla: boolean;
  mult: number;
  guest: boolean;
  foilToggle: boolean;
  listToggle: boolean;
  listEra: boolean;
  released: string | null;
  includeBonus: boolean;
  separatorType: "land" | "token";
  bonusType: string;
  tokenSheets: boolean;
}

export interface SpecResult {
  mode: BoosterMode;
  code: string;
  layout: CommanderLayout | null;
  opts: SpecOptions;
  stats: Stats | null;
  pools: PlayPools | CommanderPools | null;
  slots: Slot[];
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
  const selection = useOptionsStore((s) => s.selection);
  const options = useOptionsStore(selectOptions);
  const setsByCode = useSetsByCode();

  const boosterMode: BoosterMode = isBoosterMode(mode) ? mode : "play";
  const code = selectCode({ mode, selection });
  const layout = selectLayout({ mode, selection });

  /*
   * The code is debounced before it reaches a query, so typing "dsk" loads one
   * set's pools rather than three. The spec itself still re-renders at once.
   */
  const settledCode = useDebounced(code, 350);

  const playQuery = useQuery({
    ...queries.playPools(settledCode),
    enabled: boosterMode === "play" && !!settledCode,
  });
  const commanderQuery = useQuery({
    ...queries.commanderPools(settledCode),
    enabled: boosterMode === "commander" && !!settledCode,
  });
  const active = boosterMode === "play" ? playQuery : commanderQuery;

  // Pools belonging to a different set than the one now chosen are ignored, so
  // the panel never shows one set's counts under another's name.
  const pools = settledCode === code ? (active.data ?? null) : null;

  const released = setsByCode.get(code)?.released_at ?? null;

  const opts: SpecOptions = useMemo(
    () => ({
      vanilla: options.vanilla,
      mult: options.vanilla ? 1 : options.mult,
      guest: !options.vanilla && options.preferGuestList,
      // The play-only fun options never apply to Commander boosters.
      foilToggle:
        boosterMode === "play" && !options.vanilla && options.foilToggle,
      listToggle:
        boosterMode === "play" && !options.vanilla && options.listToggle,
      listEra:
        !!released &&
        released >= PLAY_BOOSTER_START &&
        released < LIST_ERA_END,
      released,
      includeBonus: options.includeBonus,
      separatorType: options.separatorType,
      bonusType: options.bonusType,
      tokenSheets: options.tokenSheets,
    }),
    [options, released, boosterMode],
  );

  return useMemo(() => {
    const stats = pools ? statsFromPools(pools) : null;
    const build = (o: SpecOptions) =>
      boosterMode === "play"
        ? playSpec(o, stats)
        : commanderSpec(layout ?? "cmr", o, stats);

    const slots = build(opts);
    // Same set, same card counts, official odds: anything that differs is down
    // to the options chosen on this tab.
    const vanillaSlots = opts.vanilla ? null : build(vanillaOpts(opts));
    const diffs = diffFromVanilla(slots, vanillaSlots).map(collapseChanges);

    return {
      mode: boosterMode,
      code,
      layout,
      opts,
      stats,
      pools,
      slots,
      vanillaSlots,
      diffs,
      diffCount: diffs.reduce((a, c) => a + c.length, 0),
      loading: !!settledCode && active.isFetching && !pools,
      error: (active.error as Error) ?? null,
    };
  }, [
    boosterMode,
    code,
    layout,
    opts,
    pools,
    settledCode,
    active.isFetching,
    active.error,
  ]);
}
