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
  isDoubleFacedToken,
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

/** One printing per artwork, in collector-number order. */
export function sheetCards(cards: Card[]): Card[] {
  return distinctArt(byCollectorNumber(cards as PureCard[])) as Card[];
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

  const sheets: PackEntry[][] = [];
  for (let i = 0; i < entries.length; i += perSheet)
    sheets.push(entries.slice(i, i + perSheet));
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
