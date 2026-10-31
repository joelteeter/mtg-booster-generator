/*
 * Which images a generated card shows, and what is on its back.
 *
 * Ported from `js/preview.js`. Everything here is value-in/value-out: the
 * React component does the rest. The images come from links already present
 * in the Scryfall card data, so previewing a pack costs no API requests.
 */
import type { PackEntry } from "@/lib/generate/generate";
import type { Card, ImageUris } from "@/lib/scryfall/types";

export type ImageSize = keyof ImageUris;

/**
 * Every face image a card has, in face order.
 *
 * The last branch is for the built-in bonus lands, which carry only an id:
 * Scryfall's CDN path is derived from it, which is why they can be shown
 * without a request.
 */
export function faceImages(card: Card, size: ImageSize = "normal"): string[] {
  if (card.image_uris) return [card.image_uris[size] as string];
  if (card.card_faces && card.card_faces.some((f) => f.image_uris))
    return card.card_faces
      .filter((f) => f.image_uris)
      .map((f) => (f.image_uris as ImageUris)[size] as string);
  if (card.id)
    return [
      `https://cards.scryfall.io/${size}/front/${card.id[0]}/${card.id[1]}/${card.id}.jpg`,
    ];
  return [];
}

export interface CardSide {
  url: string;
  name: string;
}

/**
 * The two sides of one printed card.
 *
 * That is either a double-faced card's own faces, or — for a token separator
 * or a token sheet slot — two different cards, one printed on each side.
 */
export function cardSides(entry: PackEntry): CardSide[] {
  const urls = faceImages(entry.card);
  const faceNames =
    entry.card.card_faces && entry.card.card_faces.length > 1
      ? entry.card.card_faces
          .filter((f) => f.image_uris)
          .map((f) => f.name as string)
      : [];
  const sides: CardSide[] = urls.map((url, i) => ({
    url,
    name: faceNames[i] || (entry.card.name as string),
  }));
  if (entry.backCard) {
    const back = faceImages(entry.backCard);
    if (back.length) sides.push({ url: back[0], name: entry.backCard.name });
  }
  return sides;
}
