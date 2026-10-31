/*
 * Structural comparison for the parity harness.
 *
 * `toEqual` would do the assertion, but not the reporting: a sweep of several
 * hundred specs needs a failure that names the case, the slot, the outcome and
 * the field. So specs are normalised to a canonical shape and then walked,
 * collecting one readable line per difference.
 */
import type { Slot } from "@/lib/booster/types";

/** Canonical form of one outcome: every field present, `undefined` as null. */
interface NormOutcome {
  pool: string;
  label: unknown;
  p: unknown;
  foil: unknown;
  tag: unknown;
  formula: unknown;
  boosterFun: unknown;
}

/** Canonical form of one slot. */
interface NormSlot {
  n: unknown;
  title: unknown;
  types: unknown;
  affects: string;
  from: unknown;
  to: unknown;
  outcomes: NormOutcome[];
}

const nil = (v: unknown): unknown => (v === undefined ? null : v);

/* A pool is a key or a fallback chain; render both the same way. */
const poolKey = (p: unknown): string =>
  Array.isArray(p) ? `[${p.join(",")}]` : String(p);

/* eslint-disable @typescript-eslint/no-explicit-any */
function normOutcome(o: any): NormOutcome {
  return {
    pool: poolKey(o.pool),
    label: nil(o.label),
    p: nil(o.p),
    foil: nil(o.foil),
    tag: nil(o.tag),
    formula: nil(o.formula),
    boosterFun: nil(o.boosterFun),
  };
}

export function normSpec(slots: any[]): NormSlot[] {
  return slots.map((s) => ({
    n: nil(s.n),
    title: nil(s.title),
    types: nil(s.types),
    affects: (s.affects || []).join(","),
    from: nil(s.from),
    to: nil(s.to),
    outcomes: (s.outcomes || []).map(normOutcome),
  }));
}

/**
 * Every way two values differ, as `path: old → new` lines. Numbers are
 * compared exactly: both implementations do the same arithmetic in the same
 * order, so anything other than bit-identical is a real difference.
 */
export function differences(
  oldValue: unknown,
  newValue: unknown,
  path = "",
): string[] {
  const at = path || "(root)";

  if (Object.is(oldValue, newValue)) return [];

  if (Array.isArray(oldValue) || Array.isArray(newValue)) {
    if (!Array.isArray(oldValue) || !Array.isArray(newValue))
      return [`${at}: ${describe(oldValue)} → ${describe(newValue)}`];
    if (oldValue.length !== newValue.length)
      return [
        `${at}: length ${oldValue.length} → ${newValue.length} (${describe(oldValue)} → ${describe(newValue)})`,
      ];
    return oldValue.flatMap((v, i) =>
      differences(v, newValue[i], `${at}[${i}]`),
    );
  }

  if (isPlain(oldValue) && isPlain(newValue)) {
    const keys = Array.from(
      new Set([...Object.keys(oldValue), ...Object.keys(newValue)]),
    ).sort();
    return keys.flatMap((k) =>
      differences(
        (oldValue as Record<string, unknown>)[k],
        (newValue as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
      ),
    );
  }

  return [`${at}: ${describe(oldValue)} → ${describe(newValue)}`];
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function describe(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Map)
    return `Map(${JSON.stringify(Array.from(v.entries()))})`;
  return String(v);
}

/** Differences between an old spec and a new one, compared slot by slot. */
export function specDifferences(oldSlots: any[], newSlots: Slot[]): string[] {
  return differences(normSpec(oldSlots), normSpec(newSlots));
}

/** Maps compare as sorted entry lists, so insertion order is not asserted. */
export function mapToEntries(m: unknown): unknown {
  if (!(m instanceof Map)) return m;
  return Array.from(m.entries())
    .map(([k, v]) => [k, v])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
