/*
 * Reading a decklist.
 *
 * The format asked for is `QUANTITY NAME (SET) NUMBER`, which is what
 * Moxfield, Archidekt and Scryfall's own export all produce:
 *
 *     1 Academy Ruins (TRC) 512
 *
 * Nothing here talks to Scryfall. A line becomes a `ProxyLine` saying what
 * was asked for, and `resolve.ts` turns that into cards — so every oddity of
 * the format is settled in a pure function with the whole list in front of it,
 * and a bad line is a thing to report rather than a request that fails.
 *
 * It is deliberately forgiving, because the lists people paste come from
 * everywhere: `4x Sol Ring`, a bare name with no set at all, `[TRC]` brackets,
 * Moxfield's `*F*` foil marker, category tags, and the section headings a
 * deck export writes between its parts.
 */

export interface ProxyLine {
  /** 1-based line in the pasted text, so the report can point at it. */
  line: number;
  raw: string;
  /** How many copies. 1 when the line does not say. */
  qty: number;
  /** As typed, for the report. The front face only — see `matchName`. */
  name: string;
  /** Upper case, or null when the line names no set. */
  set: string | null;
  /** As typed: collector numbers are not always numbers (`123a`, `★`). */
  number: string | null;
}

export interface BadLine {
  line: number;
  raw: string;
  why: string;
}

export interface ProxyParse {
  lines: ProxyLine[];
  bad: BadLine[];
  /** Cards asked for, counting copies. */
  total: number;
}

/**
 * Headings a deck export writes between its sections. Ignored rather than
 * treated as cards, but only when the line has no quantity on it: "Commander"
 * alone is a heading, and `1 Commander Tower` is not.
 */
const HEADINGS =
  /^(deck|decklist|main ?deck|sideboard|side ?board|commanders?|companion|maybe ?board|considering|tokens?|about|planes?|schemes?|stickers?|attractions?)\s*(\(\s*\d+\s*\))?\s*:?\s*$/i;

/** `//` and `#` start a comment only at the start of a line: see `matchName`. */
const COMMENT = /^\s*(\/\/|#)/;

/** `1`, `1x`, `4 x`, or nothing at all. */
const QTY = /^(\d{1,4})\s*[xX*]?\s+/;

/**
 * Moxfield's finish markers and category tags, which sit after the collector
 * number: `*F*` foil, `*E*` etched, `#Ramp`. A proxy is paper either way, so
 * the finish is dropped rather than recorded.
 */
const TRAILING = /(\s+\*[A-Za-z]\*|\s+#[^\s#]+)+\s*$/;

/**
 * `(TRC) 512`, `[TRC] 512`, or a set with no number after it.
 *
 * Two to six characters, which is every Scryfall set code, and letters and
 * digits only — enough to tell a set code from Archidekt's category brackets,
 * which hold words.
 */
const SET_AND_NUMBER = /[([]([A-Za-z0-9]{2,6})[)\]]\s*([^\s]+)?\s*$/;

/** A trailing collector number with no set in front of it: `Plains 318`. */
const BARE_NUMBER = /\s+(\d{1,5}[a-z★†]?)\s*$/i;

/**
 * The name to look a card up by.
 *
 * A double-faced card is written `Front // Back` by most exporters, and
 * Scryfall knows it by its front face, so that is what gets sent.
 */
export const matchName = (name: string): string =>
  (name.split("//")[0] ?? name).trim();

export function parseProxyList(text: string): ProxyParse {
  const lines: ProxyLine[] = [];
  const bad: BadLine[] = [];
  let total = 0;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || COMMENT.test(trimmed) || HEADINGS.test(trimmed)) return;

    let rest = trimmed;
    let qty = 1;
    const q = QTY.exec(rest);
    if (q) {
      qty = parseInt(q[1], 10);
      rest = rest.slice(q[0].length);
    }
    rest = rest.replace(TRAILING, "").trim();

    let set: string | null = null;
    let number: string | null = null;
    const m = SET_AND_NUMBER.exec(rest);
    if (m) {
      set = m[1].toUpperCase();
      number = m[2] ?? null;
      rest = rest.slice(0, m.index).trim();
    } else {
      const n = BARE_NUMBER.exec(rest);
      if (n) {
        number = n[1];
        rest = rest.slice(0, n.index).trim();
      }
    }

    const name = rest.replace(/\s+/g, " ").trim();
    if (!name) {
      bad.push({ line, raw: trimmed, why: "no card name on this line" });
      return;
    }
    if (qty < 1) {
      bad.push({ line, raw: trimmed, why: "asks for no copies" });
      return;
    }
    lines.push({ line, raw: trimmed, qty, name, set, number });
    total += qty;
  });

  return { lines, bad, total };
}
