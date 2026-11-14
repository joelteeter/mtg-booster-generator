/*
 * A resolved list, laid out nine to a page.
 *
 * One slot on the paper is one entry here, and that is the whole point of
 * this file. The exporter splits a double-faced card into two slots itself,
 * which is right for a pack — nine cards go in, nine or ten slots come out,
 * and the pages reflow. A proxy list cannot work that way: the page you
 * choose in the downloads table has to be the page you saw in the preview,
 * so the faces are split here, before anything is counted, and every entry
 * that reaches the exporter is exactly one slot.
 *
 * In "separate" mode a double-faced card becomes two single-faced entries,
 * each printing with a plain card back, which is what sleeving them needs.
 * In "front only" it stays one entry and the exporter prints its second face
 * on the backs sheet, making a real two-sided card. Neither is expanded
 * again downstream.
 */
import { isDoubleFacedToken as isDfc } from "@/lib/booster";
import type { DfcMode } from "@/lib/export";
import { PER_PAGE } from "@/lib/export/paper";
import type { PackEntry } from "@/lib/generate";
import type { Card } from "@/lib/scryfall/types";

import type { ProxyCard } from "./resolve";

/**
 * One face of a card as a card of its own: the same Scryfall card, with that
 * face's name and art and no second face.
 *
 * Both halves of a split are made this way, the front included. Leaving the
 * front as the two-faced card it came from would hand the exporter something
 * it would split again — the very thing this page exists to avoid.
 */
export function faceCard(card: Card, face: 0 | 1): Card {
  const side = card.card_faces?.[face];
  return {
    ...card,
    name: side?.name ?? card.name,
    image_uris: side?.image_uris ?? card.image_uris,
    card_faces: undefined,
  };
}

/** What the preview caption shows: the printing this slot is actually of. */
const printing = (card: Card): string =>
  `${(card.set ?? "").toUpperCase()} ${card.collector_number ?? ""}`.trim();

/**
 * One entry per slot, in the order the list was written, with each line's
 * copies together.
 */
export function proxyEntries(
  resolved: ProxyCard[],
  dfcMode: DfcMode,
): PackEntry[] {
  const out: PackEntry[] = [];
  for (const { line, card } of resolved) {
    if (!card) continue;
    for (let copy = 0; copy < line.qty; copy++) {
      const base = { finish: "nonfoil", label: printing(card) };
      if (dfcMode === "separate" && isDfc(card)) {
        out.push({ ...base, card: faceCard(card, 0), slot: out.length + 1 });
        out.push({ ...base, card: faceCard(card, 1), slot: out.length + 1 });
      } else {
        out.push({ ...base, card, slot: out.length + 1 });
      }
    }
  }
  return out;
}

/** Nine to a page, the last page short. */
export function proxyPages(
  entries: PackEntry[],
  perPage: number = PER_PAGE,
): PackEntry[][] {
  const pages: PackEntry[][] = [];
  for (let i = 0; i < entries.length; i += perPage)
    pages.push(entries.slice(i, i + perPage));
  return pages;
}

/** `Proxies-All-7`, then `Proxies-1` … — the sheets pages' shape. */
export function proxyFilenames(count: number): string[] {
  return [`Proxies-All-${count}`].concat(
    Array.from({ length: count }, (_, i) => `Proxies-${i + 1}`),
  );
}
