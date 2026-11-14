/*
 * The Lands and Tokens pages: which set, and what came back.
 *
 * Separate from the packs store on purpose. A booster run and a sheet of
 * lands have nothing in common beyond the printer — different inputs, no
 * odds, no pack order — and sharing one store would mean generating packs
 * cleared your lands, or worse, that a download read the wrong one.
 */
import { create } from "zustand";

import type { LandFilter, SheetKind } from "@/lib/sheets";

import { mergeSlice, persist, STORE_VERSION } from "./persist";

interface SheetsState {
  /** The set code chosen, lower case. Empty until one is. */
  code: string;
  /** Two tokens to a card. Tokens only; lands always print single-sided. */
  doubleSided: boolean;
  /** How much of the set's lands to print. Lands only. */
  landFilter: LandFilter;
  /** Pad the last page out to nine with more cards from the same set. */
  fill: boolean;
}

interface SheetsStore {
  byKind: Record<SheetKind, SheetsState>;
  setCode(kind: SheetKind, code: string): void;
  setDoubleSided(value: boolean): void;
  setLandFilter(value: LandFilter): void;
  setFill(kind: SheetKind, value: boolean): void;
}

const empty = (): SheetsState => ({
  code: "",
  doubleSided: true,
  landFilter: "all",
  fill: false,
});

export const useSheetsStore = create<SheetsStore>()(
  persist(
    (set) => ({
  byKind: { lands: empty(), tokens: empty() },
  setCode: (kind, code) =>
    set((s) => ({
      byKind: { ...s.byKind, [kind]: { ...s.byKind[kind], code } },
    })),
  setDoubleSided: (doubleSided) =>
    set((s) => ({
      byKind: {
        ...s.byKind,
        tokens: { ...s.byKind.tokens, doubleSided },
      },
    })),
  setLandFilter: (landFilter) =>
    set((s) => ({
      byKind: { ...s.byKind, lands: { ...s.byKind.lands, landFilter } },
    })),
  setFill: (kind, fill) =>
    set((s) => ({
      byKind: { ...s.byKind, [kind]: { ...s.byKind[kind], fill } },
    })),
    }),
    {
      name: "mtg-sheet-choices",
      version: STORE_VERSION,
      merge: mergeSlice<SheetsStore, "byKind">("byKind"),
    },
  ),
);
