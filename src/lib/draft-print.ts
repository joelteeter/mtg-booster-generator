/*
 * Everybody's decks, as pages to print.
 *
 * This is the step the whole feature exists for. Drafting in person means
 * printing every card in every pack and watching most of them go unplayed;
 * drafting first means printing a deck and five cards beside it, which is
 * about a third of the paper and all of it gets used.
 *
 * It reuses the Proxies page's machinery rather than having any of its own:
 * `cardEntries` turns cards into printed slots, `runExport` builds the PDF,
 * and the per-player page break is the exporter's own `newPagePerPack` with a
 * player standing where a pack usually does. The only thing written here is
 * which cards, in what order, under what name.
 *
 * Deliberately not in `lib/draft`: that module is bundled into the Netlify
 * function and knows nothing of Scryfall cards or PDFs. This is the browser's
 * side of the seam, next to `draft-pool.ts`, which is the same seam the other
 * way round.
 */
import type { DfcMode } from "@/lib/export";
import type { PackEntry } from "@/lib/generate";
import { cardEntries } from "@/lib/proxies";
import type { DeckSheet } from "@/lib/room";
import type { Card, CardIdentifier } from "@/lib/scryfall/types";

/**
 * Resolved cards, keyed by whatever asked for them: a Scryfall id for a card
 * somebody drafted, a plain name for a basic land nobody did.
 */
export type Found = Map<string, Card>;

export interface BasicsChoice {
  /** Off by default: most people already own a pile of basic lands. */
  include: boolean;
  /** Which set's basics to print. Any printing will do; this picks a look. */
  set?: string;
}

/** Basics in the order a decklist writes them, not the order they were typed. */
const BASIC_ORDER = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"];

const basicCounts = (sheet: DeckSheet): [string, number][] =>
  BASIC_ORDER.map(
    (name) =>
      [name, sheet.basics[name as keyof DeckSheet["basics"]] ?? 0] as [
        string,
        number,
      ],
  ).filter(([, count]) => count > 0);

/**
 * Everything the print needs looked up, as one `/cards/collection` request
 * per seventy-five.
 *
 * Drafted cards are asked for by id, which names one printing and cannot be
 * wrong — the draft has handled nothing but ids since the pool was uploaded,
 * so nothing here can resolve to the wrong art. Basics are asked for by name
 * because nobody drafted them and there is no id to have.
 */
export function printIdentifiers(
  decks: readonly DeckSheet[],
  basics: BasicsChoice,
): CardIdentifier[] {
  const ids = new Set<string>();
  for (const deck of decks)
    for (const card of [...deck.main, ...deck.side]) ids.add(card.id);

  const out: CardIdentifier[] = [...ids].map((id) => ({ id }));
  if (!basics.include) return out;

  const names = new Set<string>();
  for (const deck of decks)
    for (const [name] of basicCounts(deck)) names.add(name);
  for (const name of names)
    out.push(basics.set ? { name, set: basics.set } : { name });
  return out;
}

/**
 * One player's cards to print, in deck order: the deck, its basic lands, then
 * the sideboard.
 *
 * The sideboard is printed. Five cards is what the house rule holds it to
 * precisely so that it can be — a full one would be the rest of the pool,
 * which is the paper this is all trying not to use.
 */
export function deckCards(
  sheet: DeckSheet,
  found: Found,
  basics: BasicsChoice,
): Card[] {
  const cards: Card[] = [];
  for (const ref of sheet.main) {
    const card = found.get(ref.id);
    if (card) cards.push(card);
  }
  if (basics.include)
    for (const [name, count] of basicCounts(sheet)) {
      const card = found.get(name);
      if (!card) continue;
      for (let i = 0; i < count; i++) cards.push(card);
    }
  for (const ref of sheet.side) {
    const card = found.get(ref.id);
    if (card) cards.push(card);
  }
  return cards;
}

const line = (card: Card, count: number): string =>
  `${count} ${card.name} (${(card.set ?? "").toUpperCase()}) ${
    card.collector_number ?? ""
  }`.trimEnd();

/** Identical printings gathered into one line, in first-seen order. */
const tally = (cards: readonly Card[]): string[] => {
  const counts = new Map<string, { card: Card; n: number }>();
  for (const card of cards) {
    const key = `${card.set}|${card.collector_number}|${card.name}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, { card, n: 1 });
  }
  return [...counts.values()].map(({ card, n }) => line(card, n));
};

/**
 * A decklist, in the format `/proxies` reads.
 *
 * Which is the point of writing one at all: the admin can paste it there and
 * change something before printing, rather than this page being the only way
 * out. `Sideboard` is a heading the proxy parser already knows, so the text
 * round-trips without being edited first.
 */
export function decklistText(
  sheet: DeckSheet,
  found: Found,
  basics: BasicsChoice,
): string {
  const main = [...sheet.main]
    .map((ref) => found.get(ref.id))
    .filter((c): c is Card => !!c);
  if (basics.include)
    for (const [name, count] of basicCounts(sheet)) {
      const card = found.get(name);
      for (let i = 0; i < count && card; i++) main.push(card);
    }
  const side = sheet.side
    .map((ref) => found.get(ref.id))
    .filter((c): c is Card => !!c);

  const out = tally(main);
  if (side.length) out.push("", "Sideboard", ...tally(side));
  return out.join("\n");
}

/** One row per player, which is what makes the page break fall between them. */
export const printRows = (
  decks: readonly DeckSheet[],
  found: Found,
  basics: BasicsChoice,
  dfcMode: DfcMode,
): PackEntry[][] =>
  decks.map((sheet) => cardEntries(deckCards(sheet, found, basics), dfcMode));

/** Letters, digits and hyphens: a name has to survive being a filename. */
const safeName = (name: string): string =>
  name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "player";

/**
 * `Draft-K7MQ2F-All-8`, then `Draft-K7MQ2F-1-Ada` … — the downloads table's
 * shape, with the seat in the name so two people called Dev cannot collide
 * and the files sort into seat order.
 */
export const printFilenames = (
  code: string,
  decks: readonly DeckSheet[],
): string[] => [
  `Draft-${code}-All-${decks.length}`,
  ...decks.map((d) => `Draft-${code}-${d.seat + 1}-${safeName(d.name)}`),
];
