/*
 * A deck built out of what somebody drafted, and whether it is legal.
 *
 * Pure, and in the draft module rather than the room's, because the function
 * checks a deck before it stores one. The browser checks the same deck as it
 * is built, so the two can never disagree about what is wrong with it — there
 * is one implementation and the client is only showing its answer early.
 *
 * The rules are limited's, with one house change: a sideboard of five rather
 * than the whole rest of the pool. That is a printing budget rather than a
 * rule of the game — the point of drafting first is to print less paper, and
 * a full sideboard would print all of it.
 */
import type { Taken } from "./types";

/** A draft deck is forty cards, basics included. */
export const DECK_MIN = 40;

/** How many cards may sit beside it. The house rule; see above. */
export const SIDEBOARD_MAX = 5;

/**
 * Basics are added rather than drafted, so they are counted by name instead
 * of being card keys: nobody opened them, and which printing they get is a
 * question for whoever prints them — if they are printed at all, which by
 * default they are not.
 */
export const BASICS = [
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
] as const;

export type BasicLand = (typeof BASICS)[number];

/** No real deck wants more; the cap is here to stop a typo storing 10,000. */
export const BASIC_MAX = 60;

export interface Deck {
  /** Card keys, from this seat's own pool. */
  main: string[];
  /** Card keys, at most `SIDEBOARD_MAX`, none of them also in `main`. */
  side: string[];
  /** Basic lands by name. Added, not drafted. */
  basics: Partial<Record<BasicLand, number>>;
}

export const emptyDeck = (): Deck => ({ main: [], side: [], basics: {} });

export type DeckProblem =
  | { kind: "too-small"; have: number; need: number }
  | { kind: "not-yours"; card: string }
  | { kind: "repeated"; card: string }
  | { kind: "in-both"; card: string }
  | { kind: "sideboard-too-big"; have: number; max: number }
  | { kind: "unknown-basic"; name: string }
  | { kind: "bad-basic-count"; name: string };

export interface DeckCheck {
  ok: boolean;
  problems: DeckProblem[];
  /** Drafted cards in the main deck. */
  cards: number;
  /** Basic lands added to it. */
  basics: number;
  /** What a judge would count: the two together. */
  total: number;
  side: number;
}

const isBasic = (name: string): name is BasicLand =>
  (BASICS as readonly string[]).includes(name);

/**
 * What is wrong with a deck, if anything.
 *
 * Every problem is collected rather than returning at the first, because the
 * builder shows them all at once: being told about one missing card at a time
 * is how a form becomes unpleasant.
 */
export function checkDeck(deck: Deck, pool: readonly string[]): DeckCheck {
  const problems: DeckProblem[] = [];
  const yours = new Set(pool);

  const seen = new Set<string>();
  for (const card of [...deck.main, ...deck.side]) {
    if (!yours.has(card)) problems.push({ kind: "not-yours", card });
    if (seen.has(card)) problems.push({ kind: "repeated", card });
    seen.add(card);
  }

  /*
   * A card in both lists is its own complaint rather than a repeat, because
   * it is the one a builder actually produces: moving a card to the sideboard
   * without taking it out of the deck.
   */
  const inMain = new Set(deck.main);
  for (const card of deck.side)
    if (inMain.has(card)) problems.push({ kind: "in-both", card });

  if (deck.side.length > SIDEBOARD_MAX)
    problems.push({
      kind: "sideboard-too-big",
      have: deck.side.length,
      max: SIDEBOARD_MAX,
    });

  let basics = 0;
  for (const [name, count] of Object.entries(deck.basics)) {
    if (!isBasic(name)) {
      problems.push({ kind: "unknown-basic", name });
      continue;
    }
    if (!Number.isInteger(count) || count < 0 || count > BASIC_MAX) {
      problems.push({ kind: "bad-basic-count", name });
      continue;
    }
    basics += count;
  }

  const cards = deck.main.length;
  const total = cards + basics;
  if (total < DECK_MIN)
    problems.push({ kind: "too-small", have: total, need: DECK_MIN });

  return {
    ok: problems.length === 0,
    problems,
    cards,
    basics,
    total,
    side: deck.side.length,
  };
}

/** One problem, in words. Here rather than in the page, so it is tested. */
export function problemText(p: DeckProblem): string {
  switch (p.kind) {
    case "too-small":
      return `A deck is ${p.need} cards. This one is ${p.have} — add ${
        p.need - p.have
      } more, basics included.`;
    case "not-yours":
      return "There is a card in here that you did not draft.";
    case "repeated":
      return "A card is in the deck twice, and you only drafted one.";
    case "in-both":
      return "A card is in the deck and the sideboard at once.";
    case "sideboard-too-big":
      return `The sideboard holds ${p.max}. This one has ${p.have}.`;
    case "unknown-basic":
      return `${p.name} is not a basic land.`;
    case "bad-basic-count":
      return `That is not a sensible number of ${p.name}.`;
  }
}

/** The cards a seat drafted, as the keys a deck is built from. */
export const poolOf = (taken: readonly Taken[]): string[] =>
  taken.map((t) => t.card);
