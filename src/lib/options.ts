/*
 * Turning the tab's controls into the options object the spec builders take.
 *
 * This is `getOpts()` from the old `js/ui.js`, which read the form directly.
 * It is here rather than inside `useSpec` so it can be compared against the
 * original: it is small, but it is where three decisions live — vanilla mode
 * forcing the multiplier to 1 and switching the fun options off, the two
 * play-only toggles never applying to Commander boosters, and the List era
 * being a property of the set's release date rather than of the tab.
 */
import { LIST_ERA_END, PLAY_BOOSTER_START } from "@/lib/booster";
import type { TabOptions } from "@/store/options";

/** What `playSpec` and `commanderSpec` read, plus what the generator needs. */
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

export interface SpecOptionsInput {
  mode: "play" | "commander";
  options: TabOptions;
  /** The set's release date, or null while the set list is still loading. */
  released: string | null;
}

export function specOptions({
  mode,
  options,
  released,
}: SpecOptionsInput): SpecOptions {
  const vanilla = options.vanilla;
  return {
    vanilla,
    mult: vanilla ? 1 : options.mult,
    guest: !vanilla && options.preferGuestList,
    // The play-only fun options never apply to Commander boosters.
    foilToggle: mode === "play" && !vanilla && options.foilToggle,
    listToggle: mode === "play" && !vanilla && options.listToggle,
    listEra:
      !!released && released >= PLAY_BOOSTER_START && released < LIST_ERA_END,
    released,
    includeBonus: options.includeBonus,
    separatorType: options.separatorType,
    bonusType: options.bonusType,
    tokenSheets: options.tokenSheets,
  };
}
