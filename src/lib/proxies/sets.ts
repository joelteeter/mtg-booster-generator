/*
 * Which set a line with no set in it belongs to.
 *
 * The page offers a picker, and when nothing is picked this is the fallback:
 * the newest set that has actually come out. Scryfall's set list is 1,068
 * entries and most of them are not what anyone means by "the latest set" —
 * token sets, art series, promo sheets, Arena-only sets, and expansions
 * announced for next spring.
 *
 * Dates are compared as `YYYY-MM-DD` strings, as everywhere else here, so no
 * time zone can decide that today's set has not come out yet.
 */
import type { ScryfallSet } from "@/lib/scryfall/types";

/** The kinds of set a card in a decklist is normally from. */
const REAL = new Set(["core", "expansion"]);

export function mostRecentSet(
  sets: ScryfallSet[],
  today: string = new Date().toISOString().slice(0, 10),
): ScryfallSet | null {
  let best: ScryfallSet | null = null;
  for (const s of sets) {
    if (!REAL.has(String(s.set_type))) continue;
    if (s.digital) continue;
    const date = s.released_at;
    if (!date || date > today) continue;
    if (!best || date > (best.released_at ?? "")) best = s;
  }
  return best;
}
