/*
 * Card classification, used to split pools for the Commander sets and to group
 * printings by name.
 */
import type { Card, NameMap } from "./types";

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
