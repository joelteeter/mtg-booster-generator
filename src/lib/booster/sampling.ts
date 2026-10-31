/*
 * Sampling. The generator draws from exactly the outcome lists the panel
 * displays, so the explanation can never drift from what actually happens.
 */
import type {
  Card,
  NameMap,
  Outcome,
  PoolRef,
  Pools,
  Rng,
  Slot,
  Stats,
} from "./types";

/** First pool in a fallback chain that has cards in it. */
export function resolvePool(pools: Pools, key: PoolRef): NameMap | null {
  const keys = Array.isArray(key) ? key : [key];
  for (const k of keys) {
    const m = pools[k];
    if (m instanceof Map && m.size) return m;
  }
  return null;
}

/** Pick an outcome in proportion to its probability. */
export function chooseOutcome(outcomes: Outcome[], rng: Rng): Outcome {
  const total = outcomes.reduce((a, o) => a + (o.p || 0), 0);
  let r = rng() * total;
  for (const o of outcomes) {
    r -= o.p || 0;
    if (r <= 0) return o;
  }
  return outcomes[outcomes.length - 1];
}

/** Pick a card name uniformly, then one of its printings uniformly. */
export function pickFromMap(nameMap: NameMap, rng: Rng): Card | null {
  const names = Array.from(nameMap.keys());
  if (!names.length) return null;
  const name = names[Math.floor(rng() * names.length)];
  const variants = nameMap.get(name) as Card[];
  return variants[Math.floor(rng() * variants.length)];
}

export function finishFor(outcome: Outcome, rng: Rng): string {
  if (outcome.foil === "etched") return "etched";
  return rng() < ((outcome.foil as number) || 0) ? "foil" : "nonfoil";
}

/** Pool sizes by key. Non-pool entries such as `meta` count as 0. */
export function statsFromPools(pools: Pools): Stats {
  const s: Stats = {};
  for (const k in pools) s[k] = pools[k] instanceof Map ? (pools[k] as NameMap).size : 0;
  return s;
}

/** Expected number of cards per pack for each outcome label. */
export function expectedCounts(slots: Slot[]): Record<string, number> {
  const exp: Record<string, number> = {};
  slots.forEach((s) =>
    s.outcomes.forEach((o) => {
      if (o.p == null) return;
      exp[o.label] = (exp[o.label] || 0) + s.n * o.p;
      if (o.foil === "etched" || (o.foil as number) > 0)
        exp.__foil =
          (exp.__foil || 0) +
          s.n * o.p * (o.foil === "etched" ? 1 : (o.foil as number));
    }),
  );
  return exp;
}
