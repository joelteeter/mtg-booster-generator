/*
 * The wording around a finished generation: the status line, the pack names in
 * the preview dropdown, and the downloads table's row labels.
 *
 * Pulled out of the DOM-writing code in `js/generate.js` and `js/downloads.js`
 * so the strings are testable against the old ones. Prose that the user reads
 * is worth a test: a dropped "✨" or a wrong plural is invisible in a diff.
 */
import { isDoubleFacedToken } from "@/lib/booster";

import type { GeneratedPack } from "./generate";

/**
 * A double-faced card: no image of its own, and both faces have one.
 *
 * `js/export.js` calls this `isDfc` and `lib/booster/tokens.ts` calls it
 * `isDoubleFacedToken`; they are the same predicate, written twice in the old
 * app. One of them wins here.
 */
export const isDfc = isDoubleFacedToken;

export const dfcCount = (pack: GeneratedPack): number =>
  pack.cards.filter((e) => isDfc(e.card)).length;

export const dfcNames = (pack: GeneratedPack): string =>
  pack.cards
    .filter((e) => isDfc(e.card))
    .map((e) => e.card.name)
    .join(", ");

const s = (n: number): string => (n === 1 ? "" : "s");

/** "Pack 3", or the name of a sheet riding along after the packs. */
export const packName = (pack: GeneratedPack, index: number): string =>
  pack.tokenSheet
    ? `Token sheet ${pack.tokenSheet}`
    : pack.landSheet
      ? `Land sheet ${pack.landSheet}`
      : `Pack ${index + 1}`;

/** One entry in the preview's pack dropdown. */
export function previewOptionLabel(
  pack: GeneratedPack,
  index: number,
): string {
  const dfc = dfcCount(pack);
  return (
    `${packName(pack, index)} (${pack.cards.length} cards)` +
    (pack.godPack ? " ✨ God Pack" : "") +
    (dfc ? ` ⟲ ${dfc} double-faced` : "")
  );
}

/** The downloads table's first row: everything in one file. */
export function allPacksLabel(packs: GeneratedPack[]): string {
  const sheets = packs.filter((p) => p.tokenSheet).length;
  const lands = packs.filter((p) => p.landSheet).length;
  const count = packs.length - sheets - lands;
  return (
    `All ${count} pack${s(count)}` +
    (sheets ? ` + ${sheets} token sheet${s(sheets)}` : "") +
    (lands ? ` + ${lands} land sheet${s(lands)}` : "")
  );
}

export interface StatusParams {
  packCount: number;
  mode: "play" | "commander";
  vanilla: boolean;
  packs: GeneratedPack[];
  tokenSheetCount: number;
  landSheetCount?: number;
}

/** The line under the Generate button once a run finishes. */
export function generateStatus({
  packCount,
  mode,
  vanilla,
  packs,
  tokenSheetCount,
  landSheetCount = 0,
}: StatusParams): string {
  const godPacks = packs.filter((p) => p.godPack).length;
  const dfcPacks = packs.filter(
    (p) => !p.tokenSheet && !p.landSheet && dfcCount(p),
  ).length;
  const landCards = packs.find((p) => p.landSheet)?.cards.length ?? 0;
  return (
    `✅ Successfully generated ${packCount} ` +
    `${mode === "play" ? "Booster Pack" : "Commander booster"}${s(packCount)}` +
    `${vanilla ? " (vanilla)" : ""}.` +
    (godPacks
      ? ` ✨ ${godPacks} God Pack${s(godPacks)} (all 14 cards rare or mythic)!`
      : "") +
    (tokenSheetCount
      ? ` 🌟 ${tokenSheetCount} token sheet${s(tokenSheetCount)} with every` +
        ` token in the set; print them double-sided.`
      : "") +
    (landSheetCount
      ? ` 🏞 A land sheet with ${landCards} of the set's lands.`
      : "") +
    (dfcPacks
      ? ` ⟲ ${dfcPacks} pack${s(dfcPacks)} ${dfcPacks === 1 ? "contains" : "contain"}` +
        ` double-faced cards; check the "Double-faced cards" print setting.`
      : "")
  );
}
