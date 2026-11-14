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
export function byCollectorNumber(cards: Card[]): Card[] {
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

/** One per distinct artwork: a second copy would print the same image. */
export function distinctArt(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const art = String(c.illustration_id ?? c.collector_number ?? c.name);
    if (seen.has(art)) return false;
    seen.add(art);
    return true;
  });
}

/**
 * One of every name, then a second of every name, and so on.
 *
 * Taking them name by name instead piled three Plains and three Islands onto
 * Duskmourn's page with no second Forest, which is the wrong nine cards to
 * hand someone building a deck.
 */
function roundRobinByName(cards: Card[]): Card[] {
  const byName = new Map<string, Card[]>();
  for (const c of cards) {
    const printings = byName.get(c.name ?? "");
    if (printings) printings.push(c);
    else byName.set(c.name ?? "", [c]);
  }
  const out: Card[] = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const printings of byName.values()) {
      if (round >= printings.length) continue;
      out.push(printings[round]);
      added = true;
    }
    if (!added) return out;
  }
}

/**
 * The set's full-art lands, over as many pages as they need.
 *
 * The full-art lands decide how many pages there are, because they are what
 * the sheet is for — Star Trek has ten of them and will not fit on one page.
 * Whatever is left of the last page is filled with the set's ordinary basic
 * arts rather than left blank, since they are worth having too and the paper
 * is already being printed.
 *
 * A set with no full-art lands at all still gets one page of its basics,
 * which is what the option did before full-art drove the count.
 */
export function buildLandSheets(lands: Card[], perPage: number): Card[][] {
  const all = byCollectorNumber(lands);
  const basics = all.filter(isBasicLand);
  // Every set this is meant for has basics; one that has none still gets a
  // useful page out of whatever lands it does have.
  const distinct = distinctArt(basics.length ? basics : all);

  const fullArt = roundRobinByName(distinct.filter((c) => c.full_art));
  const plain = roundRobinByName(distinct.filter((c) => !c.full_art));

  const pages = Math.max(1, Math.ceil(fullArt.length / perPage));
  const cards = [...fullArt, ...plain].slice(0, pages * perPage);

  const sheets: Card[][] = [];
  for (let i = 0; i < cards.length; i += perPage)
    sheets.push(cards.slice(i, i + perPage));
  return sheets;
}
