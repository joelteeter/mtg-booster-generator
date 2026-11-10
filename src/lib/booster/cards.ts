/*
 * Card classification, used to split pools for the Commander sets and to group
 * printings by name.
 */
import type { Card, NameMap, Pools } from "./types";

/** Double-faced cards carry their types on the faces, not the card. */
export const typeLine = (c: Card): string =>
  c.type_line ||
  (c.card_faces ? c.card_faces.map((f) => f.type_line).join(" // ") : "");

export const isLegendCreatureOrPW = (c: Card): boolean =>
  /Legendary/.test(typeLine(c)) && /(Creature|Planeswalker)/.test(typeLine(c));

export const isBackground = (c: Card): boolean =>
  /Background/.test(typeLine(c));

export const isPiper = (c: Card): boolean => c.name === "The Prismatic Piper";

/** Reversible printings are named "X // X"; group them with the normal "X". */
export function nameKey(c: Card): string {
  const parts = (c.name || "").split(" // ");
  return parts.length === 2 && parts[0] === parts[1] ? parts[0] : (c.name as string);
}

/**
 * A printing you could hold in non-foil.
 *
 * Some printings exist only as a foil, and they are not ordinary cards with a
 * shiny finish — they are separate printings, with their own collector
 * numbers, art treatments and frames: surge foil, galaxy foil, double-rainbow
 * serialized, box toppers, Expeditions, foil-etched. Asking for one of those
 * "in non-foil" asks for something that was never printed, and it would reach
 * the PDF looking like the treatment it is.
 *
 * Scryfall gives every real card a `finishes` array, so a card without one is
 * test data rather than a foil-only printing and is kept.
 */
export const hasNonFoilPrinting = (c: Card): boolean =>
  !c.finishes || c.finishes.includes("nonfoil");

/**
 * Drop the foil-only printings, unless that would leave nothing.
 *
 * The fallback matters for a name whose every printing is foil-only: better
 * to print the card that was asked for than to drop it from the pack.
 */
export function nonFoilPrintings<T extends Card>(cards: T[]): T[] {
  const real = cards.filter(hasNonFoilPrinting);
  return real.length ? real : cards;
}

/** The same over one pool: every name kept, each one's printings narrowed. */
export function nonFoilMap(pool: NameMap): NameMap {
  const map: NameMap = new Map();
  for (const [name, printings] of pool)
    map.set(name, nonFoilPrintings(printings));
  return map;
}

/** The same over every pool. Nothing that is not a pool — `meta` — is touched. */
export function nonFoilPools(pools: Pools): Pools {
  const out: Pools = {};
  for (const key in pools) {
    const pool = pools[key];
    out[key] = pool instanceof Map ? nonFoilMap(pool) : pool;
  }
  return out;
}

/**
 * Group printings by card name, so sampling picks a name first and an
 * alternate treatment second. Without this, a card with six showcase printings
 * would be six times as likely as its neighbour.
 */
export function groupByName(cards: Card[]): NameMap {
  const map: NameMap = new Map();
  cards.forEach((c) => {
    const k = nameKey(c);
    if (!map.has(k)) map.set(k, []);
    (map.get(k) as Card[]).push(c);
  });
  return map;
}
