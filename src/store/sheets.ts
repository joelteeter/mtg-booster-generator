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

interface SheetsState {
  /** The set code chosen, lower case. Empty until one is. */
  code: string;
  /** Two tokens to a card. Tokens only; lands always print single-sided. */
  doubleSided: boolean;
  /** How much of the set's lands to print. Lands only. */
  landFilter: LandFilter;
}

interface SheetsStore {
  byKind: Record<SheetKind, SheetsState>;
  setCode(kind: SheetKind, code: string): void;
  setDoubleSided(value: boolean): void;
  setLandFilter(value: LandFilter): void;
}

const empty = (): SheetsState => ({
  code: "",
  doubleSided: true,
  landFilter: "all",
});

export const useSheetsStore = create<SheetsStore>((set) => ({
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
}));
