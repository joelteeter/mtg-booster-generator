/*
 * God Packs (2027 onward).
 *
 * Each Booster Pack has an independent 1-in-1,000 chance of being a God Pack,
 * in which all 14 playable cards are rares or mythics:
 *   10 non-foil, 2 non-foil Booster Fun, 2 traditional foil Booster Fun.
 * The 15th card is the God Pack celebration card, which lives in the
 * non-playable slot this app does not simulate (as with tokens and art cards),
 * so it is not generated.
 *
 * The ten plain slots use the normal random-printing rule, so some of them come
 * out Booster Fun anyway. Forcing default frames there would contradict how
 * every other slot picks its printing.
 */
import { finalizeSlots, rareMythic, withoutFoils } from "./probability";
import type { Card, Slot, Stats } from "./types";
import type { OutcomeExtra } from "./probability";

export const GOD_PACK_CHANCE = 0.001;

export function godPackSpec(stats: Stats | null, noFoils = false): Slot[] {
  const rm = (extra: OutcomeExtra) =>
    rareMythic(stats, "rares", "mythics", 1, ["Rare", "Mythic"], extra);
  const slots = [
      {
        n: 10,
        title: "Rare or mythic",
        types: "Any non-basic rare or mythic",
        outcomes: rm({ foil: 0 }),
      },
      {
        n: 2,
        title: "Booster Fun rare or mythic",
        types: "Rare or mythic in a Booster Fun treatment",
        outcomes: rm({ foil: 0, boosterFun: true }),
      },
      {
        n: 2,
        title: noFoils
          ? "Booster Fun rare or mythic (the foil slots)"
          : "Booster Fun rare or mythic (foil)",
        types: noFoils
          ? "Rare or mythic in a Booster Fun treatment; the pack's foil slots, printed non-foil"
          : "Rare or mythic in a Booster Fun treatment, traditional foil",
        outcomes: rm({ foil: 1, boosterFun: true }),
      },
  ];
  return finalizeSlots(noFoils ? withoutFoils(slots) : slots, stats);
}

/**
 * A "Booster Fun" printing is one of the set's alternate treatments rather than
 * its default frame: showcase, borderless, extended-art or full-art.
 */
export function isBoosterFun(card: Card | null | undefined): boolean {
  if (!card) return false;
  if (card.border_color === "borderless" || card.full_art) return true;
  const fx = card.frame_effects || [];
  return (
    fx.indexOf("showcase") >= 0 ||
    fx.indexOf("extendedart") >= 0 ||
    fx.indexOf("inverted") >= 0
  );
}
