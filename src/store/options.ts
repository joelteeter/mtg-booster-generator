/*
 * Options and tab state.
 *
 * `js/state.js` kept `mode`, `modeState` and the pool caches in one global
 * scope and let every other file mutate them. The caches are TanStack Query's
 * job now; what is left is this store.
 *
 * The shape follows the old one deliberately: options are remembered *per tab*
 * (`modeState`), so a setting chosen for Booster Packs never leaks into
 * Commander boosters, while the set selection is shared because the old UI had
 * one set of controls for it.
 */
import { create } from "zustand";

import type { CommanderLayout } from "@/lib/booster/types";

export type Mode = "play" | "commander" | "planechase" | "archenemy";
export type BoosterMode = "play" | "commander";

export const isBoosterMode = (m: Mode): m is BoosterMode =>
  m === "play" || m === "commander";

/** The options each tab remembers separately — `OPT_IDS` in the old state.js. */
export interface TabOptions {
  packCount: number;
  vanilla: boolean;
  mult: number;
  preferGuestList: boolean;
  foilToggle: boolean;
  listToggle: boolean;
  includeBonus: boolean;
  separatorType: "land" | "token";
  bonusType: string;
  tokenSheets: boolean;
}

/** Which set is chosen. Shared across tabs, as in the old UI. */
export interface SetSelection {
  /** Play tab: the dropdown, and a typed code that overrides it. */
  setSelect: string;
  customSet: string;
  /** Commander tab: an official set, or any set with a borrowed layout. */
  cmdSource: "official" | "any";
  cmdSetSelect: string;
  cmdAnySetSelect: string;
  cmdAnyCustom: string;
  cmdLayout: CommanderLayout;
}

/** Page defaults, matching the old index.html's initial control values. */
export const DEFAULT_OPTIONS: TabOptions = {
  packCount: 3,
  vanilla: false,
  mult: 1,
  preferGuestList: false,
  foilToggle: false,
  listToggle: false,
  includeBonus: true,
  separatorType: "land",
  bonusType: "classic",
  tokenSheets: false,
};

export const DEFAULT_SELECTION: SetSelection = {
  setSelect: "",
  customSet: "",
  cmdSource: "official",
  cmdSetSelect: "cmm",
  cmdAnySetSelect: "",
  cmdAnyCustom: "",
  cmdLayout: "cmr",
};

interface OptionsStore {
  mode: Mode;
  byMode: Record<BoosterMode, TabOptions>;
  selection: SetSelection;
  setMode(mode: Mode): void;
  /** Writes to whichever booster tab is active. */
  setOption<K extends keyof TabOptions>(key: K, value: TabOptions[K]): void;
  setSelection(patch: Partial<SetSelection>): void;
}

export const useOptionsStore = create<OptionsStore>((set) => ({
  mode: "play",
  byMode: {
    play: { ...DEFAULT_OPTIONS },
    commander: { ...DEFAULT_OPTIONS },
  },
  selection: { ...DEFAULT_SELECTION },
  setMode: (mode) => set({ mode }),
  setOption: (key, value) =>
    set((s) =>
      isBoosterMode(s.mode)
        ? {
            byMode: {
              ...s.byMode,
              [s.mode]: { ...s.byMode[s.mode], [key]: value },
            },
          }
        : s,
    ),
  setSelection: (patch) =>
    set((s) => ({ selection: { ...s.selection, ...patch } })),
}));

/** The active booster tab's options. Falls back to Play on a simulator tab. */
export const selectOptions = (s: {
  mode: Mode;
  byMode: Record<BoosterMode, TabOptions>;
}): TabOptions => s.byMode[isBoosterMode(s.mode) ? s.mode : "play"];

/** True when the Commander tab is borrowing a layout for a non-Commander set. */
export const isCommanderAny = (s: {
  mode: Mode;
  selection: SetSelection;
}): boolean => s.mode === "commander" && s.selection.cmdSource === "any";

/** The set code in effect. A typed code always beats the dropdown. */
export function selectCode(s: { mode: Mode; selection: SetSelection }): string {
  const sel = s.selection;
  if (s.mode === "commander") {
    if (!isCommanderAny(s)) return sel.cmdSetSelect;
    return (sel.cmdAnyCustom.trim() || sel.cmdAnySetSelect || "").toLowerCase();
  }
  return (sel.customSet.trim() || sel.setSelect || "").toLowerCase();
}

/**
 * Which Commander slot layout to use: the set's own when an official set is
 * chosen, or the one picked for "any set".
 */
export function selectLayout(s: {
  mode: Mode;
  selection: SetSelection;
}): CommanderLayout | null {
  if (s.mode !== "commander") return null;
  return isCommanderAny(s)
    ? s.selection.cmdLayout
    : (s.selection.cmdSetSelect as CommanderLayout);
}
