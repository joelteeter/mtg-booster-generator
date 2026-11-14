/*
 * Printing a set's cards as sheets, outside a booster run.
 *
 * The booster page prints packs, and adds a land sheet or token sheets to the
 * end of one. These are the same pages on their own: pick a set, print its
 * lands, or its tokens. That is a different job — there is nothing random
 * about it, no odds, no pack order — so it has its own pages rather than
 * another checkbox on a generator.
 *
 * The card data comes from one Scryfall search per set, and everything below
 * is arithmetic over the result.
 */
import {
  byCollectorNumber,
  distinctArt,
  isBasicLand,
  isDoubleFacedToken,
  nonFoilPrintings,
  tokenPair,
} from "@/lib/booster";
import type { Card as PureCard, TokenSlot } from "@/lib/booster/types";
import type { PackEntry } from "@/lib/generate";
import type { Card, ScryfallSet } from "@/lib/scryfall/types";

export type SheetKind = "lands" | "tokens";

/** Nine to a page, as everywhere else in the app. */
export const PER_SHEET = 9;

/**
 * The search for one set's cards.
 *
 * Promos are not excluded, unlike the booster pools. A booster pool is asking
 * "what could come out of a pack", where a promo could not; this is asking
 * "what did this set print", where it did. It also matters for the products
 * that are nothing but promos — a Secret Lair drop is one set of them.
 */
export const sheetQuery = (kind: SheetKind, code: string): string =>
  kind === "lands" ? `set:${code} t:land` : `set:${code}`;

/**
 * Which set holds a set's tokens.
 *
 * A set's tokens live in a set of their own, "t" and the set's code: `tdsk`
 * for Duskmourn. Choosing a token set directly is allowed too, and has to be
 * told apart by its type rather than its code — `thb` is Theros Beyond Death,
 * not the tokens of `hb`.
 */
export function tokenSetFor(set: ScryfallSet): string {
  return set.set_type === "token" ? set.code : "t" + set.code;
}

/**
 * How much of a set's lands to print.
 *
 * Nested rather than independent: full-art lands are basics, so "full-art" is
 * a narrowing of "basics" and not a separate axis. Two checkboxes would allow
 * a fourth state that means nothing.
 */
export type LandFilter = "all" | "basics" | "fullArtBasics";

export const LAND_FILTERS: Array<{ id: LandFilter; label: string }> = [
  { id: "all", label: "All lands" },
  { id: "basics", label: "Basic lands" },
  { id: "fullArtBasics", label: "Full-art basics" },
];

export function filterLands(cards: Card[], filter: LandFilter): Card[] {
  if (filter === "all") return cards;
  const basics = cards.filter((c) => isBasicLand(c as PureCard));
  return filter === "basics"
    ? basics
    : basics.filter((c) => (c as PureCard).full_art);
}

/**
 * One printing per artwork, in collector-number order, never one that was
 * only ever made as a foil.
 *
 * The foils go first, before the artwork is deduplicated. A set often prints
 * one art both ways, and deduplicating first could keep the foil-only
 * printing and throw away the ordinary one — which would then be dropped as
 * unprintable, losing a card the set does have.
 */
export function sheetCards(cards: Card[]): Card[] {
  const printable = nonFoilPrintings(cards as PureCard[]);
  return distinctArt(byCollectorNumber(printable)) as Card[];
}

/** How many printings were skipped for existing only as a foil. */
export const foilOnlyCount = (cards: Card[]): number =>
  cards.length - nonFoilPrintings(cards as PureCard[]).length;

/**
 * A small deterministic generator, seeded from the set code.
 *
 * The filler has to be the same every time the page renders. With
 * `Math.random` the preview would reshuffle on every keystroke elsewhere on
 * the page, and the PDF you downloaded would hold different cards from the
 * ones you had just looked at. Seeding it from the selection means the same
 * set and the same filter always give the same page.
 */
export function seedFrom(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pad the last page out to a full nine with more cards from the same set.
 *
 * Off by default, because the pages are a reference first: one of each is
 * the point, and a second copy of a card is only worth having if you were
 * going to use the paper anyway. On, it is drawn from the same selection, so
 * narrowing to full-art basics fills with full-art basics.
 */
export function fillToPage<T>(
  items: T[],
  perSheet: number,
  seed: string,
): T[] {
  const short = items.length % perSheet;
  if (!items.length || short === 0) return items;
  const rng = seedFrom(seed);
  const extra = Array.from(
    { length: perSheet - short },
    () => items[Math.floor(rng() * items.length)],
  );
  return [...items, ...extra];
}

/**
 * Lay cards out as pages.
 *
 * Lands are single-sided: a land in a deck needs a card back, so its sheet is
 * printed like any page of cards. Tokens can be doubled up — two to a card,
 * one per side — because you only ever need the face that is up, which is
 * what the booster token sheets have always done; it halves the paper.
 */
export function buildSheets(
  cards: Card[],
  kind: SheetKind,
  doubleSided: boolean,
  perSheet: number = PER_SHEET,
  fill: { seed: string } | null = null,
): PackEntry[][] {
  const entries: PackEntry[] =
    kind === "tokens" && doubleSided
      ? pairUp(cards).map((slot, i) => ({
          card: slot.card as Card,
          backCard: (slot.backCard ?? null) as Card | null,
          tokenSlot: true,
          finish: "nonfoil",
          slot: i + 1,
          label: "Token",
        }))
      : cards.map((card, i) => ({
          card,
          finish: "nonfoil",
          slot: i + 1,
          label: kind === "lands" ? "Land" : "Token",
        }));

  /*
   * Padded after the pairing, not before, so a filled token page is nine
   * cards rather than nine tokens — the unit being filled is the slot on the
   * paper.
   */
  const placed = fill ? fillToPage(entries, perSheet, fill.seed) : entries;

  const sheets: PackEntry[][] = [];
  for (let i = 0; i < placed.length; i += perSheet)
    sheets.push(
      placed.slice(i, i + perSheet).map((e, k) => ({ ...e, slot: k + 1 })),
    );
  return sheets;
}

/**
 * Two tokens to a card, except one that is already double-faced and brings
 * its own back. An odd one out keeps a blank back rather than repeating a
 * token: these pages are a reference, and a second copy of one token at the
 * cost of a different one is a poor trade.
 */
function pairUp(cards: Card[]): TokenSlot[] {
  const slots: TokenSlot[] = [];
  const singles: PureCard[] = [];
  for (const c of cards as PureCard[]) {
    // A double-faced token already has a back of its own.
    if (isDoubleFacedToken(c)) slots.push(tokenPair(c));
    else singles.push(c);
  }
  for (let i = 0; i < singles.length; i += 2)
    slots.push(tokenPair(singles[i], singles[i + 1] ?? null));
  return slots;
}

/** Filenames: `DSK-Lands-1`, and one for everything in a single file. */
export function sheetFilenames(
  code: string,
  kind: SheetKind,
  count: number,
): string[] {
  const label = kind === "lands" ? "Lands" : "Tokens";
  const upper = code.toUpperCase();
  return [`${upper}-All${label}-${count}`].concat(
    Array.from({ length: count }, (_, i) => `${upper}-${label}-${i + 1}`),
  );
}
