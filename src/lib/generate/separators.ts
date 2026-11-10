/*
 * Pack separators: the bonus land, or a pair of tokens.
 *
 * These two were deliberately left behind in `js/scryfall.js` at phase 2
 * because they are generator concerns rather than pool loading: each one
 * resolves the data once and hands back a picker the generator calls per pack.
 * Both took their randomness from `Math.random` directly; here the `Rng` is
 * injected, like everything in `lib/booster`, so a generated run is
 * reproducible.
 *
 * `loadCycle` and `loadTokens` are injected too. The app passes the TanStack
 * Query versions, so a second run over the same cycle costs no requests.
 */
import {
  LAND_CYCLES,
  nonFoilMap,
  nonFoilPrintings,
  pickFromMap,
  sortTokens,
  tokenPair,
  tokenSetCode,
} from "@/lib/booster";
import type { LandCycle, NameMap, Rng, TokenSlot } from "@/lib/booster/types";
import type { Card } from "@/lib/scryfall/types";

/*
 * Pools are keyed `NameMap`s of the pure layer's loose `Card`, but every card
 * in them came out of Scryfall. This is the one place that says so, so the
 * generator, the CSV writer and the preview can all work with the real shape.
 */
const asCard = (c: unknown): Card => c as Card;

/** One separator land, with the cycle it came from. */
export interface BonusPick {
  card: Card;
  /** The built-in printings carry their own CSV column marker. */
  section: string | null;
  cycle: string;
}

export type BonusPicker = () => BonusPick;
export type TokenSeparatorPicker = () => TokenSlot;

export interface BonusDeps {
  loadCycle(cycle: LandCycle): Promise<NameMap>;
  rng: Rng;
  onWarn?: (message: string) => void;
  /**
   * Draw no printing that exists only as a foil.
   *
   * The separator lands need this as much as the packs do, and arguably more:
   * a cycle search gathers every printing of a name across every set it has
   * ever appeared in, so the foil-only ones pile up. Overgrown Tomb has five
   * of twenty — surge foil, box topper, serialized, galaxy foil, Expedition.
   */
  noFoils?: boolean;
}

export interface TokenSeparatorDeps {
  loadTokens(code: string): Promise<Card[]>;
  rng: Rng;
  /** Draw no token that exists only as a foil. */
  noFoils?: boolean;
}

/**
 * Resolve the chosen bonus land cycle to a picker.
 *
 * "Random" is not one cycle: every real cycle is loaded and one of them is
 * chosen per pack, so a cycle that fails to load is skipped rather than
 * failing the whole generation. A cycle that loads but is empty is skipped too.
 */
export async function prepareBonus(
  typeId: string,
  { loadCycle, rng, onWarn = (m) => console.warn(m), noFoils }: BonusDeps,
): Promise<BonusPicker> {
  const real = LAND_CYCLES.filter((c) => c.id !== "random");
  const usable = async (c: LandCycle): Promise<NameMap> => {
    const map = await loadCycle(c);
    return noFoils ? nonFoilMap(map) : map;
  };
  if (typeId === "random") {
    const maps: Array<{ cycle: LandCycle; map: NameMap }> = [];
    for (const c of real) {
      try {
        const m = await usable(c);
        if (m.size) maps.push({ cycle: c, map: m });
      } catch (e) {
        onWarn(
          `Skipping ${c.label}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (!maps.length) throw new Error("Could not load any bonus land cycle.");
    return () => {
      const pick = maps[Math.floor(rng() * maps.length)];
      const card = asCard(pickFromMap(pick.map, rng));
      return { card, section: card.section || null, cycle: pick.cycle.label };
    };
  }
  const cycle = real.find((c) => c.id === typeId) || real[0];
  const map = await usable(cycle);
  if (!map.size) throw new Error(`No printings found for ${cycle.label}.`);
  return () => {
    const card = asCard(pickFromMap(map, rng));
    return { card, section: card.section || null, cycle: cycle.label };
  };
}

/**
 * Two different tokens per separator: one on the front, another on the back.
 *
 * The retry loop is bounded at eight attempts rather than sampling without
 * replacement, so a set with very few tokens occasionally prints the same one
 * on both sides. That is deliberate — it keeps each pack's draw independent.
 */
export async function prepareTokenSeparator(
  code: string,
  { loadTokens, rng, noFoils }: TokenSeparatorDeps,
): Promise<TokenSeparatorPicker> {
  const loaded = await loadTokens(code);
  const tokens = noFoils ? nonFoilPrintings(loaded) : loaded;
  if (!tokens.length)
    throw new Error(
      `${String(code).toUpperCase()} has no tokens on Scryfall ` +
        `(looked in ${tokenSetCode(code).toUpperCase()}).`,
    );
  const pool = sortTokens(tokens) as Card[];
  const pick = (): Card => pool[Math.floor(rng() * pool.length)];
  return () => {
    const front = pick();
    let back = pick();
    for (let i = 0; pool.length > 1 && i < 8 && back.id === front.id; i++)
      back = pick();
    return tokenPair(front, back);
  };
}
