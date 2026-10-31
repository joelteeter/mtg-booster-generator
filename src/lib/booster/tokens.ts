/*
 * Token separator sheets.
 *
 * A set's tokens live in their own Scryfall set, "t" plus the set's code (tdsk
 * for Duskmourn), alongside its emblems. Tokens are kept apart by collector
 * number rather than by name, because a set often prints two different tokens
 * that share one: Duskmourn has two Spirits and two Insects. Every other pool
 * in the app groups by name; this is the one place that would silently halve
 * the set.
 */
import type { Card, Rng, TokenSlot } from "./types";

export const tokenSetCode = (code: string | null | undefined): string =>
  "t" + String(code || "").toLowerCase();

/**
 * A token that is already double-faced brings its own back with it, so it
 * fills a slot alone; every other token is paired with a second one.
 */
export const isDoubleFacedToken = (c: Card | null | undefined): boolean =>
  !!(
    c &&
    !c.image_uris &&
    c.card_faces &&
    c.card_faces.length > 1 &&
    c.card_faces[0].image_uris &&
    c.card_faces[1].image_uris
  );

/** Collector-number order, numerically, with the string as a tie-break. */
export function sortTokens(tokens: Card[]): Card[] {
  const num = (c: Card): number => {
    const m = /\d+/.exec(c.collector_number || "");
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
  };
  return tokens
    .slice()
    .sort(
      (a, b) =>
        num(a) - num(b) ||
        String(a.collector_number).localeCompare(String(b.collector_number)),
    );
}

/**
 * One slot of a token sheet: a token on the front and a different one on the
 * back, or a double-faced token showing its own two faces.
 */
export function tokenPair(front: Card, back?: Card | null): TokenSlot {
  return isDoubleFacedToken(front)
    ? { card: front, tokenSlot: true }
    : { card: front, backCard: back || null, tokenSlot: true };
}

/**
 * Lay every token in the set over as many pages as it takes to get one of
 * each, printed double-sided: a slot holds one token on the front and a
 * different one on the back, so a 9-card page covers up to 18 of them. Slots
 * left over on the last page are filled with random tokens from the same set
 * rather than left blank, and so is the back of an odd last pair.
 */
export function tokenSheets(
  tokens: Card[],
  perPage: number,
  rng: Rng,
): TokenSlot[][] {
  const all = sortTokens(tokens);
  if (!all.length) return [];
  const random = (): Card => all[Math.floor(rng() * all.length)];

  const slots: TokenSlot[] = [],
    singles: Card[] = [];
  for (const t of all) {
    if (isDoubleFacedToken(t)) slots.push(tokenPair(t));
    else singles.push(t);
  }
  for (let i = 0; i < singles.length; i += 2)
    slots.push(tokenPair(singles[i], singles[i + 1]));

  while (slots.length % perPage !== 0) {
    const s = tokenPair(random(), random());
    s.filler = true;
    slots.push(s);
  }
  // an odd number of single-faced tokens leaves one back empty
  for (const s of slots)
    if (!s.backCard && !isDoubleFacedToken(s.card)) s.backCard = random();

  const sheets: TokenSlot[][] = [];
  for (let i = 0; i < slots.length; i += perPage)
    sheets.push(slots.slice(i, i + perPage));
  return sheets;
}
