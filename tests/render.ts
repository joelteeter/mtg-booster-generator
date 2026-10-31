/*
 * Turning a value into the text the golden files hold.
 *
 * Two renderings, because one does not fit both jobs. A slot spec is large and
 * there are a thousand of them, so it is written as one line per slot and one
 * indented line per outcome — compact enough to store and shaped like the
 * table it describes. Everything else is written as one `path = value` line
 * per leaf, which is the same shape `differences()` reports, so a failure
 * reads the same way it did when the old app was still here to compare
 * against.
 *
 * Numbers go through `String`, which is the shortest text that parses back to
 * the same double. These are comparisons of values, not of rounded renderings.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Fields a cell may not contain, so the pipe format stays unambiguous. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "~";
  const s = String(v);
  if (s === "~" || s.includes("|") || s.includes("\n")) {
    throw new Error(`a recorded field needs escaping: ${JSON.stringify(s)}`);
  }
  return s;
}

/**
 * One line per slot, then one indented line per outcome. The fields are
 * exactly those `normSpec` keeps, in that order.
 */
export function renderSpec(slots: any[]): string {
  const lines: string[] = [];
  for (const s of slots) {
    lines.push(
      [s.n, s.from, s.to, s.title, s.types, s.affects].map(cell).join("|"),
    );
    for (const o of s.outcomes ?? []) {
      lines.push(
        "  " +
          [o.pool, o.label, o.p, o.foil, o.tag, o.formula, o.boosterFun]
            .map(cell)
            .join("|"),
      );
    }
  }
  return lines.join("\n");
}

/** Maps become sorted entry lists, so insertion order is never asserted. */
function plain(v: any): any {
  if (v instanceof Map) {
    return Object.fromEntries(
      [...v.entries()]
        .map(([k, val]) => [String(k), plain(val)] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
  }
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = plain(v[k]);
    return out;
  }
  return v;
}

/** One `path = value` line per leaf, sorted, with `~` for null. */
export function renderValue(value: unknown): string {
  const lines: string[] = [];
  const walk = (v: any, path: string) => {
    if (Array.isArray(v)) {
      if (!v.length) lines.push(`${path} = []`);
      else v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (!keys.length) lines.push(`${path} = {}`);
      else for (const k of keys) walk(v[k], path ? `${path}.${k}` : k);
      return;
    }
    lines.push(`${path || "(root)"} = ${cell(v)}`);
  };
  walk(plain(value), "");
  return lines.join("\n");
}

/**
 * A sampled sequence on one line.
 *
 * Five hundred draws is five hundred lines if rendered as a list, and the
 * sequence is the thing being compared, not its individual entries.
 */
export const renderSequence = (items: unknown[]): string =>
  items.map(cell).join(",");

/**
 * Token sheets by the cards in each slot, one line per slot.
 *
 * Only the identity of each card is written, not the card itself: they all
 * come from one fixture, so a name says which token it is, and writing the
 * whole object out again would be several hundred kilobytes of fixture.
 */
export function renderSheets(sheets: any[][]): string {
  const name = (c: any) => (c ? (c.name ?? c.id) : null);
  return sheets
    .flatMap((page, p) =>
      page.map((slot, s) =>
        [
          `${p}.${s}`,
          name(slot.card),
          name(slot.backCard),
          slot.tokenSlot ?? null,
          slot.filler ?? null,
        ]
          .map(cell)
          .join("|"),
      ),
    )
    .join("\n");
}

/**
 * Recorded drawing calls, one compact line each.
 *
 * A page of nine cards is a few hundred operators, and writing each number on
 * its own `path = value` line turns sixteen option combinations into more than
 * a megabyte. One line per call still diffs usefully — a changed coordinate
 * shows up as a changed line — and costs a twentieth of the space.
 */
export const renderCalls = (calls: unknown[]): string =>
  calls.map((c) => JSON.stringify(c)).join("\n");
