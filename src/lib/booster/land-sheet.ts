/*
 * The land sheet: one page holding the set's basic lands.
 *
 * Packs give you the set's duals and utility lands, but nothing gives you the
 * basics, and a draft is unplayable without them. This is one printable page
 * of them: every basic land in the set first, then the set's full-art lands
 * to fill the page out.
 *
 * Those two are not as different as they sound. A modern set's full-art lands
 * are its basics in a second treatment — `s:dsk t:land is:fullart` answers
 * with five cards, and all five are named Plains, Island, Swamp, Mountain and
 * Forest. So the page comes out as one of each basic plus a few alternate
 * arts, which is both what fits and what is worth having.
 *
 * Single-sided, unlike the token sheets. Two tokens can share a card because
 * you only ever need the face that is up; two lands cannot, because a land in
 * a deck has to have a card back.
 */
import { typeLine } from "./cards";
import type { Card } from "./types";

export const isBasicLand = (c: Card): boolean => /Basic/.test(typeLine(c));

/** Collector-number order, numerically, with the string as a tie-break. */
function byCollectorNumber(cards: Card[]): Card[] {
  const num = (c: Card): number => {
    const m = /\d+/.exec(c.collector_number || "");
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
  };
  return cards
    .slice()
    .sort(
      (a, b) =>
        num(a) - num(b) ||
        String(a.collector_number).localeCompare(String(b.collector_number)),
    );
}

/**
 * One page of the set's basic lands, spread evenly across the types.
 *
 * Taken a round at a time rather than a name at a time: one printing of every
 * basic, then a second of every basic, and so on until the page is full. Going
 * name by name instead gave Duskmourn three Plains, three Islands and no
 * second Forest, which is the wrong nine cards to hand someone building a
 * deck.
 *
 * Within a name the full-art printings come first, so the page leads with the
 * set's nicest treatment of each basic and falls back to its ordinary art for
 * the later rounds. A set with too few printings to fill nine slots leaves the
 * page part-full rather than repeating one: the second copy would print the
 * same image twice.
 */
export function buildLandSheet(lands: Card[], perPage: number): Card[] {
  const all = byCollectorNumber(lands);
  const basics = all.filter(isBasicLand);
  // Every set this is meant for has basics; one that has none still gets a
  // useful page out of whatever lands it does have.
  const source = basics.length ? basics : all;

  const byName = new Map<string, Card[]>();
  for (const c of source) {
    const name = c.name ?? "";
    const printings = byName.get(name);
    if (printings) printings.push(c);
    else byName.set(name, [c]);
  }
  // A stable sort, so collector order survives inside each treatment.
  for (const printings of byName.values())
    printings.sort((a, b) => Number(!!b.full_art) - Number(!!a.full_art));

  const sheet: Card[] = [];
  for (let round = 0; sheet.length < perPage; round++) {
    let added = false;
    for (const printings of byName.values()) {
      if (round >= printings.length) continue;
      sheet.push(printings[round]);
      added = true;
      if (sheet.length === perPage) return sheet;
    }
    if (!added) break;
  }
  return sheet;
}
