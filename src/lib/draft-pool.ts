/*
 * A generated run, as a draft pool.
 *
 * The admin generates packs on the Boosters page exactly as they would to
 * print them, and the draft takes the same run — so there is one generator,
 * with one set of odds and options, rather than a second one that would drift.
 *
 * Deliberately not in `lib/draft`: that module is bundled into the Netlify
 * function and knows nothing about Scryfall cards or generated packs. This is
 * the seam between the two, and it lives on the browser's side of it.
 */
import type { GeneratedPack } from "@/lib/generate";
import type { PackCard } from "@/lib/room";

/**
 * The real packs, as cards a draft can be dealt from.
 *
 * Three things are dropped, all of them printing artifacts rather than cards
 * anybody drafts: the token sheets and the land sheet, which are pages that
 * follow the packs, and the token separator inside each pack, which is the
 * card that goes between packs so you can tell them apart in a pile.
 */
export function poolFromRun(packs: readonly GeneratedPack[]): PackCard[][] {
  return packs
    .filter((p) => p.tokenSheet === null && p.landSheet === null)
    .map((pack) =>
      pack.cards
        .filter((entry) => !entry.bonus && typeof entry.card.id === "string")
        .map((entry) => ({ id: entry.card.id, finish: entry.finish })),
    );
}
