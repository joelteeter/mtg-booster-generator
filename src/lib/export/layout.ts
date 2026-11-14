/*
 * Where every card lands: which page, which cell, and which image.
 *
 * This is the half of `js/export.js` that is pure arithmetic, and the half
 * that decides whether a printed sheet is right. It had no tests at all in the
 * old app; here it is compared against the original function for function, in
 * `tests/export-parity.test.ts`.
 */
import { isDoubleFacedToken as isDfc } from "@/lib/booster";
import type { PackEntry } from "@/lib/generate";
import type { Card } from "@/lib/scryfall/types";

import { GRID, PER_PAGE } from "./paper";

export type Quality = "high" | "fast";
export type DfcMode = "separate" | "frontOnly";
export type Flip = "long" | "short";
export type Side = "front" | "back";

/** A pack entry once it knows which of its faces this slot prints. */
export type FacedEntry = PackEntry & { face: 0 | 1 };

/** One card's place on a page, and the image that goes there. */
export interface Placement {
  col: number;
  row: number;
  url: string | null;
  enhance: boolean;
}

/**
 * Fill pages nine at a time, in pack order.
 *
 * With `newPagePerPack` a pack starts a fresh page, so a part-filled page is
 * pushed out before the next pack begins.
 */
export function layoutPages<T>(
  packs: T[][],
  newPagePerPack: boolean,
  perPage: number = PER_PAGE,
): T[][] {
  const pages: T[][] = [];
  let cur: T[] = [];
  for (const pack of packs) {
    if (newPagePerPack && cur.length) {
      pages.push(cur);
      cur = [];
    }
    for (const entry of pack) {
      cur.push(entry);
      if (cur.length === perPage) {
        pages.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/**
 * Decide how many slots each entry takes.
 *
 * "separate" gives a double-faced card's back its own slot right after the
 * front, for sleeving; "frontOnly" places the front alone and lets the backs
 * PDF print the back face behind it.
 *
 * A token slot is double-sided by design — another token, or the token's own
 * second face, prints on its back — so it is never split in two the way a
 * double-faced card can be.
 */
export function expandFaces(
  packs: PackEntry[][],
  dfcMode: DfcMode,
): FacedEntry[][] {
  return packs.map((pack) =>
    pack.flatMap((entry): FacedEntry[] => {
      const front: FacedEntry = { ...entry, face: 0 };
      if (entry.tokenSlot) return [front];
      return dfcMode === "separate" && isDfc(entry.card)
        ? [front, { ...entry, face: 1 }]
        : [front];
    }),
  );
}

/** The image for one face of a card, falling back to Scryfall's CDN path. */
export function imageUrl(
  card: Card,
  quality: Quality,
  face: 0 | 1 = 0,
): string | null {
  const size = quality === "fast" ? "large" : "png";
  const ext = size === "png" ? "png" : "jpg";
  const uris =
    face === 1
      ? card.card_faces?.[1]?.image_uris
      : card.image_uris || card.card_faces?.[0]?.image_uris;
  if (uris && uris[size]) return uris[size];
  if (card.id) {
    return `https://cards.scryfall.io/${size}/${face === 1 ? "back" : "front"}/${card.id[0]}/${card.id[1]}/${card.id}.${ext}`;
  }
  return null;
}

/**
 * The standard Magic card back, the same image for every card.
 *
 * Deliberately not the card's own back: a 30th Anniversary Edition printing
 * carries a different one, and a sheet of mixed backs is not what anyone
 * wants. The old signature took the card and ignored it; it is left out here
 * so nobody expects it to matter.
 */
const STANDARD_BACK_ID = "0aeebaf5-8c7d-4636-9e82-8c27447861f7";

export function cardBackUrl(quality: Quality): string {
  const id = STANDARD_BACK_ID;
  const size = quality === "fast" ? "large" : "png";
  return `https://backs.scryfall.io/${size}/${id[0]}/${id[1]}/${id}.${size === "png" ? "png" : "jpg"}`;
}

export interface PlacementOptions {
  side: Side;
  quality: Quality;
  dfcMode: DfcMode;
  enhance?: boolean;
  /** Backs only: which way the printer turns the sheet over. */
  flip?: Flip;
  /** Backs only: a card back the user supplied. */
  customBackUrl?: string | null;
}

/**
 * Turn an offset you measured into one the backs page can use.
 *
 * You read the error holding the sheet up to a light with the fronts toward
 * you, so that is what the control means: + is right and + is up *as you were
 * looking at it*. The backs page does not see it that way. It is printed on
 * the other side and mirrored to match, so moving its content toward its own
 * +x moves it to your left once the sheet is turned over — and which axis is
 * reversed depends on which edge the printer flips about.
 *
 * Long edge mirrors left↔right, so across is reversed and up is not. Short
 * edge mirrors top↔bottom, so up is reversed and across is not.
 *
 * Without this the sign depended on a setting three fields away, and the only
 * way to find it was to print twice.
 */
export function backPageOffset(
  flip: Flip | undefined,
  xMm: number,
  yMm: number,
): { x: number; y: number } {
  // `-0` would render as a different string in the recorded calls.
  const flipped = (v: number) => (v === 0 ? 0 : -v);
  return flip === "short"
    ? { x: xMm, y: flipped(yMm) }
    : { x: flipped(xMm), y: yMm };
}

/**
 * Turn a measured rotation into one the backs page can use.
 *
 * Like the offset, you read it with the fronts toward you, where the back
 * shows through mirrored — and a mirror reverses which way round a rotation
 * goes. Unlike the offset, that is true of *both* flips: reflecting in either
 * axis turns anticlockwise into clockwise, so the sign is reversed either way
 * and the flip setting does not come into it.
 */
export const backPageRotation = (deg: number): number => (deg === 0 ? 0 : -deg);

/**
 * The matrix that turns a page about a point: `[a b c d e f]` for PDF's
 * `cm` operator, mapping p to R(p − centre) + centre.
 *
 * Rotating the sheet is not the same as rotating each thing on it. The cards,
 * the crosshairs and the crop marks have to swing together, keeping their
 * places relative to each other, which is what a transform over the whole
 * page does and what nine separately rotated images would not.
 */
export function rotationMatrix(
  deg: number,
  cx: number,
  cy: number,
): [number, number, number, number, number, number] {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

/**
 * Place one page's cards, mirrored on the backs sheet so each back lands
 * behind its front when the page is printed double-sided: flipping on the long
 * edge mirrors left↔right (column 1 front ↔ column 3 back), flipping on the
 * short edge mirrors top↔bottom.
 */
export function placementsFor(
  cards: FacedEntry[],
  opts: PlacementOptions,
): Placement[] {
  const back = opts.side === "back";
  return cards.map((entry, i) => {
    let col = i % GRID.cols;
    let row = Math.floor(i / GRID.cols);
    let url: string | null;
    let enhance = !!opts.enhance;
    if (!back) {
      url = imageUrl(entry.card, opts.quality, entry.face || 0);
    } else {
      if (opts.flip === "short") row = GRID.rows - 1 - row;
      else col = GRID.cols - 1 - col;
      if (entry.backCard) {
        // A different card on the back of this one: a token separator.
        url = imageUrl(entry.backCard, opts.quality, 0);
      } else if (entry.tokenSlot && isDfc(entry.card)) {
        // A double-faced token's own second face.
        url = imageUrl(entry.card, opts.quality, 1);
      } else if (
        opts.dfcMode === "frontOnly" &&
        entry.face !== 1 &&
        isDfc(entry.card)
      ) {
        // A real card face, so it is enhanced like the fronts.
        url = imageUrl(entry.card, opts.quality, 1);
      } else {
        url = opts.customBackUrl || cardBackUrl(opts.quality);
        enhance = false; // plain card backs are never upscaled
      }
    }
    return { col, row, url, enhance };
  });
}
