/*
 * The odds machinery every spec builder shares.
 *
 * A slot is a list of outcomes, each with a probability. Pools that a
 * particular set happens not to have are dropped and the rest renormalised, so
 * the numbers the panel shows are always the numbers the generator samples.
 */
import type {
  Foil,
  Outcome,
  PoolRef,
  Slot,
  SlotDraft,
  Stats,
} from "./types";

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Count of distinct card names in a pool, following a fallback chain. */
function count(stats: Stats, key: PoolRef): number {
  // The List is not a set pool and has no size; treat it as inexhaustible so
  // it is never dropped for being empty.
  if (key === "LIST") return Infinity;
  const keys = Array.isArray(key) ? key : [key];
  for (const k of keys) if ((stats[k] || 0) > 0) return stats[k];
  return 0;
}

/**
 * Count of distinct card names in a pool key, or the first non-empty key of a
 * fallback chain. Null while the set is still loading.
 */
export function poolCount(stats: Stats | null, key: PoolRef): number | null {
  if (!stats) return null;
  return count(stats, key);
}

/** Which pool key actually supplies an outcome (first non-empty in a chain). */
export function usedPool(stats: Stats | null, key: PoolRef): string {
  if (!stats || !Array.isArray(key)) return Array.isArray(key) ? key[0] : key;
  for (const k of key) if ((stats[k] || 0) > 0) return k;
  return key[0];
}

/**
 * Standard mythic share: each mythic is printed half as often as each rare, so
 * the share follows the set's own pools rather than a flat constant. A set with
 * more mythics than rares therefore comes out above 50%, which is correct.
 */
export function mythicShare(
  stats: Stats | null,
  rKey: PoolRef,
  mKey: PoolRef,
): { p: number | null; formula: string } {
  if (!stats) return { p: null, formula: "M ÷ (2R + M)" };
  const R = count(stats, rKey),
    M = count(stats, mKey);
  if (M === 0) return { p: 0, formula: "no mythics in pool" };
  if (R === 0) return { p: 1, formula: "no rares in pool" };
  return {
    p: M / (2 * R + M),
    formula: `M ÷ (2R + M) = ${M} ÷ (2×${R} + ${M})`,
  };
}

const fmtW = (w: number): string => (Math.round(w * 100) / 100).toString();

/** One tier of a weighted slot: a pool, its label, and its per-card weight. */
export interface Tier {
  pool: PoolRef;
  label: string;
  w: number;
}

/** Fields merged into every outcome a builder produces (usually the finish). */
export type OutcomeExtra = Partial<Outcome>;

/**
 * Probability of each tier ∝ weight × number of cards in that tier, so a tier
 * with twice the cards is twice as likely at the same weight.
 */
export function weightedTiers(
  stats: Stats | null,
  tiers: Tier[],
  extra?: OutcomeExtra,
): Outcome[] {
  if (!stats) {
    return tiers.map((t) => ({
      p: null,
      pool: t.pool,
      label: t.label,
      formula: `weight ${fmtW(t.w)} × #cards`,
      ...extra,
    }));
  }
  const raw = tiers.map((t) => t.w * count(stats, t.pool));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return tiers.map((t, i) => ({
    p: raw[i] / total,
    pool: t.pool,
    label: t.label,
    formula: `${fmtW(t.w)} × ${count(stats, t.pool)} cards`,
    ...extra,
  }));
}

/** Scale a list of outcomes by a factor, to nest one choice inside another. */
export function scale(outcomes: Outcome[], f: number | null): Outcome[] {
  return outcomes.map((o) => ({
    ...o,
    p: o.p == null || f == null ? null : o.p * f,
  }));
}

/** A rare-or-mythic pair, with the mythic share scaled by the multiplier. */
export function rareMythic(
  stats: Stats | null,
  rKey: PoolRef,
  mKey: PoolRef,
  mult: number,
  labels: [string, string],
  extra?: OutcomeExtra,
): Outcome[] {
  const ms = mythicShare(stats, rKey, mKey);
  const pM = ms.p == null ? null : clamp01(ms.p * mult);
  const f = mult > 1 ? `${ms.formula} × ${mult} (fun)` : ms.formula;
  return [
    {
      pool: rKey,
      label: labels[0],
      p: pM == null ? null : 1 - pM,
      formula: "1 − mythic share",
      ...extra,
    },
    { pool: mKey, label: labels[1], p: pM, formula: f, ...extra },
  ];
}

/**
 * Drop outcomes whose pool is empty and renormalise the remainder. Used by
 * both the explanation table and the generator, so a set missing a pool shows
 * the same odds it is actually given.
 */
export function finalize(
  outcomes: Outcome[],
  stats: Stats | null,
): Outcome[] {
  if (!stats || outcomes.some((o) => o.p == null)) return outcomes;
  const kept = outcomes.filter(
    (o) => (o.p as number) > 0 && count(stats, o.pool) > 0,
  );
  const total = kept.reduce((a, o) => a + (o.p as number), 0);
  if (total <= 0) return kept;
  return kept.map((o) => ({ ...o, p: (o.p as number) / total }));
}

/** Finalise every slot's outcomes and give each its card positions in the pack. */
export function finalizeSlots(
  slots: SlotDraft[],
  stats: Stats | null,
): Slot[] {
  let pos = 1;
  return slots.map((s) => {
    const out: Slot = {
      ...s,
      outcomes: finalize(s.outcomes, stats),
      from: pos,
      to: pos + s.n - 1,
    };
    pos += s.n;
    return out;
  });
}

/** A tier that also fixes the finish of its outcome. */
interface FoilTier extends Tier {
  foil: Foil;
}

/*
 * Booster Pack foil slot (2027 rules, "Updating Our Boosters in 2027").
 *
 * The rarity odds are the ones the old foil wildcard always had, but only the
 * rare and mythic outcomes come out foil: Wizards removed foil commons and
 * uncommons, so a foil in a pack is always a rare or mythic and most packs now
 * contain no foil at all. The chance of a foil per pack is therefore just
 * P(rare) + P(mythic) here — nothing had to be invented for the "no longer
 * guaranteed" part, which Wizards did not put a number on.
 */
export function rareMythicFoilSlot(
  stats: Stats | null,
  keys: { C: PoolRef; U: PoolRef; R: PoolRef; M: PoolRef },
  mult: number,
): Outcome[] {
  const fun = mult > 1;
  const tiers: FoilTier[] = [
    { pool: keys.C, label: "Common", w: fun ? 0 : 4, foil: 0 },
    { pool: keys.U, label: "Uncommon", w: 2, foil: 0 },
    { pool: keys.R, label: "Rare", w: 1 * mult, foil: 1 },
    { pool: keys.M, label: "Mythic", w: 0.5 * mult, foil: 1 },
  ].filter((t) => t.w > 0);
  return weightedTiers(stats, tiers).map((o, i) => ({
    ...o,
    foil: tiers[i].foil,
  }));
}

/*
 * Foil slot ("traditional foil of any rarity") — per-card weights 4:2:1:½,
 * calibrated against Duskmourn's published foil sheet (~58% commons). Still
 * used by the Commander draft boosters, which are not Booster Packs and so are
 * untouched by the 2027 rules.
 */
export function anyRarityFoil(
  stats: Stats | null,
  keys: { C: PoolRef; U: PoolRef; R: PoolRef; M: PoolRef },
  mult: number,
  extra?: OutcomeExtra,
): Outcome[] {
  const fun = mult > 1;
  const tiers: Tier[] = [
    { pool: keys.C, label: "Common", w: fun ? 0 : 4 },
    { pool: keys.U, label: "Uncommon", w: 2 },
    { pool: keys.R, label: "Rare", w: 1 * mult },
    { pool: keys.M, label: "Mythic", w: 0.5 * mult },
  ].filter((t) => t.w > 0);
  return weightedTiers(stats, tiers, extra);
}
