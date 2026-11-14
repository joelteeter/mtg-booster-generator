/*
 * Turning parsed lines into cards.
 *
 * Every line is asked for in the most exact way it allows — set plus collector
 * number is one printing and one only — and `/cards/collection` answers
 * seventy-five at a time, so a hundred-card deck is two requests rather than a
 * hundred.
 *
 * What makes this more than a lookup is what to do when a line does not
 * resolve, because a pasted list is often a little wrong: a set code from
 * before a card was reprinted, a collector number off by one, a name with no
 * set at all. Each miss falls back one step at a time — this printing, then
 * this card in this set, then this card anywhere — and every step away from
 * what was asked for is recorded as a note, so nothing is substituted
 * silently. A line that resolves to nothing is left out and reported, and the
 * rest of the list still prints.
 */
import type {
  Card,
  CardIdentifier,
  CollectionPage,
} from "@/lib/scryfall/types";

import { matchName, type ProxyLine, type ProxyParse } from "./parse";

/** Why a card is not exactly what the line asked for. */
export type ProxyNote =
  /** The line named no set, so the page's chosen set was used. */
  | { kind: "assumed-set"; set: string }
  /** The line named no collector number; the set's own copy was taken. */
  | { kind: "assumed-printing" }
  /** That set and number is not a card, but the name is — in the same set. */
  | { kind: "other-printing"; asked: string }
  /** The name is not in that set at all; this is a printing from elsewhere. */
  | { kind: "other-set"; asked: string; got: string }
  /** The card at that number is not the card the line names. */
  | { kind: "name-differs"; asked: string; got: string }
  /** Nothing matched, by any route. */
  | { kind: "missing" };

export interface ProxyCard {
  line: ProxyLine;
  /** Null when nothing matched; the line is then reported, not printed. */
  card: Card | null;
  notes: ProxyNote[];
}

export interface ResolveDeps {
  collection(
    identifiers: CardIdentifier[],
    signal?: AbortSignal,
  ): Promise<CollectionPage>;
  signal?: AbortSignal;
}

/**
 * Names compared the way a person would: case, accents and punctuation are
 * not a disagreement. `Lim-Dûl's Vault` and `lim dul s vault` are the same
 * card, and a list that has been through a spreadsheet often says the latter.
 */
export const normalizeName = (name: string): string =>
  matchName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sameSet = (a: string | undefined, b: string): boolean =>
  (a ?? "").toLowerCase() === b.toLowerCase();

/** The front face's name, which is what a decklist writes. */
const cardName = (c: Card): string => matchName(c.name || "");

/*
 * One round of lookups: distinct identifiers, chunked and sent by the client,
 * then handed back to whichever lines asked for them.
 *
 * Deduplicated because a deck is full of repeats — nine Islands is one
 * identifier — and because Scryfall's seventy-five is counted in identifiers,
 * not in cards.
 */
interface Ask {
  id: CardIdentifier;
  /** Which card, of those that came back, answers this ask. */
  match: (c: Card) => boolean;
  /** The lines waiting on it, by index into the result array. */
  waiting: number[];
}

async function runRound(
  asks: Ask[],
  deps: ResolveDeps,
): Promise<Map<number, Card>> {
  const found = new Map<number, Card>();
  if (!asks.length) return found;
  const page = await deps.collection(
    asks.map((a) => a.id),
    deps.signal,
  );
  for (const ask of asks) {
    const card = page.data.find(ask.match);
    if (!card) continue;
    for (const i of ask.waiting) found.set(i, card);
  }
  return found;
}

/** Group identical asks, so one identifier serves every line that wants it. */
function gather(
  entries: Array<{ index: number; id: CardIdentifier; match: (c: Card) => boolean }>,
): Ask[] {
  const byKey = new Map<string, Ask>();
  for (const { index, id, match } of entries) {
    const key = JSON.stringify(id);
    const existing = byKey.get(key);
    if (existing) existing.waiting.push(index);
    else byKey.set(key, { id, match, waiting: [index] });
  }
  return [...byKey.values()];
}

export async function resolveProxyList(
  parsed: ProxyParse,
  defaultSet: string,
  deps: ResolveDeps,
): Promise<ProxyCard[]> {
  const out: ProxyCard[] = parsed.lines.map((line) => ({
    line,
    card: null,
    notes: [],
  }));
  if (!out.length) return out;

  const setFor = (line: ProxyLine): string =>
    (line.set ?? defaultSet).toLowerCase();

  /* Round one: exactly what each line asks for. */
  const first = gather(
    out.map(({ line }, index) => {
      const set = setFor(line);
      const name = normalizeName(line.name);
      return line.number
        ? {
            index,
            id: { set, collector_number: line.number },
            match: (c: Card) =>
              sameSet(c.set, set) && c.collector_number === line.number,
          }
        : {
            index,
            id: { name: matchName(line.name), set },
            match: (c: Card) =>
              sameSet(c.set, set) && normalizeName(cardName(c)) === name,
          };
    }),
  );
  const exact = await runRound(first, deps);

  /*
   * Round two, for the lines whose printing does not exist: the same card in
   * the same set, whichever printing that is. A collector number drifts when
   * a list is edited by hand; the set code is usually still right.
   */
  const second = gather(
    out
      .map(({ line }, index) => ({ line, index }))
      .filter(({ index, line }) => !exact.has(index) && !!line.number)
      .map(({ index, line }) => {
        const set = setFor(line);
        const name = normalizeName(line.name);
        return {
          index,
          id: { name: matchName(line.name), set },
          match: (c: Card) =>
            sameSet(c.set, set) && normalizeName(cardName(c)) === name,
        };
      }),
  );
  const inSet = await runRound(second, deps);

  /* Round three: the card by name, from any set that printed it. */
  const third = gather(
    out
      .map((_, index) => index)
      .filter((index) => !exact.has(index) && !inSet.has(index))
      .map((index) => {
        const name = normalizeName(out[index].line.name);
        return {
          index,
          id: { name: matchName(out[index].line.name) },
          match: (c: Card) => normalizeName(cardName(c)) === name,
        };
      }),
  );
  const anywhere = await runRound(third, deps);

  out.forEach((entry, index) => {
    const { line } = entry;
    const assumedSet = !line.set;
    const set = setFor(line);
    const exactCard = exact.get(index);
    const inSetCard = inSet.get(index);
    const anywhereCard = anywhere.get(index);

    if (exactCard) {
      entry.card = exactCard;
      if (assumedSet) entry.notes.push({ kind: "assumed-set", set: set.toUpperCase() });
      if (!line.number) entry.notes.push({ kind: "assumed-printing" });
      /*
       * The number wins, because it names one printing and a name does not —
       * but a disagreement is worth seeing, since it means the list and the
       * set have drifted apart.
       */
      if (normalizeName(line.name) !== normalizeName(cardName(exactCard)))
        entry.notes.push({
          kind: "name-differs",
          asked: line.name,
          got: cardName(exactCard),
        });
      return;
    }
    if (inSetCard) {
      entry.card = inSetCard;
      if (assumedSet) entry.notes.push({ kind: "assumed-set", set: set.toUpperCase() });
      entry.notes.push({
        kind: "other-printing",
        asked: `${set.toUpperCase()} ${line.number}`,
      });
      return;
    }
    if (anywhereCard) {
      entry.card = anywhereCard;
      entry.notes.push({
        kind: "other-set",
        asked: line.set
          ? `${line.set}${line.number ? ` ${line.number}` : ""}`
          : set.toUpperCase(),
        got: (anywhereCard.set ?? "").toUpperCase(),
      });
      return;
    }
    entry.notes.push({ kind: "missing" });
  });

  return out;
}

/** The report under the text area, one sentence per note. */
export function noteText(note: ProxyNote): string {
  switch (note.kind) {
    case "assumed-set":
      return `no set on the line, so ${note.set} was used`;
    case "assumed-printing":
      return "no collector number, so the set's own printing was taken";
    case "other-printing":
      return `${note.asked} is not a card, so this set's printing of the name was used`;
    case "other-set":
      return `not found in ${note.asked}, so the ${note.got} printing was used`;
    case "name-differs":
      return `that number is “${note.got}”, not “${note.asked}”`;
    case "missing":
      return "no card found, so this line is not printed";
  }
}
