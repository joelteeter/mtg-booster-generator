/*
 * Starting a draft: the shuffles, and the keys the engine works in.
 *
 * Both shuffles here are one shuffle more than the maths needs — randomising
 * the packs alone already decides who opens what. They are both here because
 * the room has to seat every name regardless, and a draft where the admin is
 * always seat 0 looks rigged even when it is not.
 */
import type { Rng } from "@/lib/booster/types";

import type { DraftRules, DraftState, PackState } from "./types";

/** Fisher–Yates, on a copy. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Players in seat order. */
export const seatOrder = <T>(players: readonly T[], rng: Rng): T[] =>
  shuffled(players, rng);

/**
 * `p07-c03` — the generated pack, and the card within it.
 *
 * Keys name a physical card rather than a printing, so a pack holding two
 * copies of one card still has two distinguishable cards in it. The room
 * keeps the mapping from key to Scryfall id and finish; the engine never
 * looks inside one.
 */
export const cardKey = (pack: number, index: number): string =>
  `p${String(pack).padStart(2, "0")}-c${String(index).padStart(2, "0")}`;

/** Keys for a pool, given the size of each generated pack in order. */
export const poolKeys = (packSizes: readonly number[]): string[][] =>
  packSizes.map((n, pack) =>
    Array.from({ length: n }, (_, i) => cardKey(pack, i)),
  );

/**
 * Deal a pool into a draft: packs shuffled, three to a seat, round 1 opened.
 *
 * Throws rather than refusing, because both failures are a caller that has
 * built the pool wrong — a mismatched count or a repeated key — and neither
 * is something a player can cause.
 */
export function dealPacks(
  pool: readonly string[][],
  rules: DraftRules,
  rng: Rng,
): DraftState {
  const need = rules.seats * rules.rounds;
  if (pool.length !== need)
    throw new Error(
      `dealPacks: ${rules.seats} seats of ${rules.rounds} packs needs ${need} packs, got ${pool.length}`,
    );

  const every = pool.flat();
  if (new Set(every).size !== every.length)
    throw new Error("dealPacks: card keys must be unique across the draft");

  const packs: PackState[] = shuffled(pool, rng).map((cards, i) => {
    const round = Math.floor(i / rules.seats) + 1;
    const openedBy = i % rules.seats;
    return {
      id: `r${round}-s${openedBy}`,
      round,
      openedBy,
      remaining: [...cards],
      holder: round === 1 ? openedBy : null,
      seen: [],
      arrived: 0,
    };
  });

  return {
    rules,
    round: 1,
    packs,
    picked: Array.from({ length: rules.seats }, () => []),
    clock: 0,
  };
}
