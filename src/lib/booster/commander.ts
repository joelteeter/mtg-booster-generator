/*
 * Commander draft boosters.
 *
 * Three layouts: the official set's own, or the one borrowed when a
 * commander-style booster is built from any other set. Pools are listed with
 * fallback chains (first non-empty wins) so a set with few legends or no
 * Backgrounds still fills every guaranteed slot.
 *
 * These are draft boosters, not Booster Packs, so the 2027 rules do not touch
 * them: their foil slot is still a traditional foil of any rarity.
 */
import {
  anyRarityFoil,
  clamp01,
  finalizeSlots,
  rareMythic,
  scale,
  weightedTiers,
} from "./probability";
import type {
  CommanderLayout,
  CommanderOptions,
  CommanderSet,
  Outcome,
  Slot,
  SlotDraft,
  Stats,
} from "./types";

/** Commander draft-booster sets supported by the Commander tab. */
export const COMMANDER_SETS: Record<string, CommanderSet> = {
  cmr: { code: "cmr", name: "Commander Legends", released: "2020-11-20" },
  clb: {
    code: "clb",
    name: "Commander Legends: Battle for Baldur's Gate",
    released: "2022-06-10",
  },
  cmm: { code: "cmm", name: "Commander Masters", released: "2023-08-04" },
};

export const LAYOUTS: Record<CommanderLayout, string> = {
  cmr: "Commander Legends layout",
  clb: "Battle for Baldur's Gate layout",
  cmm: "Commander Masters layout",
};

/** Pool fallback chains: the first key with cards in it supplies the slot. */
const P = {
  legU: ["legU", "legC", "legAll", "uncommons"],
  legR: ["legR", "legAll", "rares"],
  legM: ["legM"],
  bgCU: ["bgCU", "legU", "legC", "legAll", "uncommons"],
  bgR: ["bgR", "legR", "legAll", "rares"],
};

export function commanderSpec(
  layout: CommanderLayout,
  opts: CommanderOptions,
  stats: Stats | null,
): Slot[] {
  const mult = opts.vanilla ? 1 : opts.mult;
  const fx = mult > 1 ? ` × ${mult} (fun)` : "";
  const nf = { foil: 0 as const };
  const M = ["mult"];
  const slots: SlotDraft[] = [];

  const common = (n: number): SlotDraft => ({
    n,
    title: "Common",
    types: "Common (no Backgrounds)",
    outcomes: [{ pool: "commons", label: "Common", p: 1, foil: 0 }],
  });
  const piperSlot = (): SlotDraft => {
    const hasPiper = !stats || (stats.piper || 0) > 0;
    return {
      n: 1,
      title: hasPiper ? "Common or Prismatic Piper" : "Common",
      types: hasPiper
        ? "Common, or The Prismatic Piper"
        : "Common (this set has no Prismatic Piper)",
      outcomes: [
        { pool: "commons", label: "Common", p: 5 / 6, foil: 0 },
        {
          pool: "piper",
          label: "The Prismatic Piper",
          tag: "Prismatic Piper",
          p: 1 / 6,
          foil: 0,
          formula: "1 in 6 packs",
        },
      ],
    };
  };
  const nlUnc = (n: number): SlotDraft => ({
    n,
    title: "Uncommon",
    types: "Nonlegendary uncommon",
    outcomes: [{ pool: "uncommons", label: "Uncommon", p: 1, foil: 0 }],
  });
  const nlRare = (): SlotDraft => ({
    n: 1,
    title: "Rare or mythic",
    types: "Nonlegendary rare or mythic",
    affects: M,
    outcomes: rareMythic(stats, "rares", "mythics", mult, ["Rare", "Mythic"], nf),
  });
  const allKeys = { C: "allC", U: "allU", R: "allR", M: "allM" };
  const foilAny = (etchedP: number): SlotDraft => {
    let outs = anyRarityFoil(stats, allKeys, mult, { foil: 1 });
    if (etchedP > 0) {
      outs = (
        [
          {
            pool: ["etched", "legAll"],
            label: "Foil-etched legend",
            p: etchedP,
            foil: "etched",
            formula: `1 in 15 packs${fx}`,
          },
        ] as Outcome[]
      ).concat(scale(outs, 1 - etchedP));
    }
    return {
      n: 1,
      title: "Foil",
      types:
        "Any card of any rarity, traditional foil" +
        (etchedP > 0 ? " (or a foil-etched legend)" : ""),
      affects: M,
      outcomes: outs,
    };
  };

  if (layout === "cmr") {
    slots.push(common(12), piperSlot(), nlUnc(3));
    slots.push({
      n: 2,
      title: "Legendary",
      types: "Legendary creature or planeswalker (any rarity)",
      affects: M,
      outcomes: weightedTiers(
        stats,
        [
          { pool: P.legU, label: "Legendary uncommon", w: 4 },
          { pool: P.legR, label: "Legendary rare", w: 2 * mult },
          { pool: P.legM, label: "Legendary mythic", w: 1 * mult },
        ],
        nf,
      ),
    });
    slots.push(nlRare());
    slots.push(foilAny(clamp01((1 / 15) * mult)));
  } else if (layout === "clb") {
    slots.push(common(13), nlUnc(3));
    const pRM = clamp01(0.31 * mult);
    const legRM = rareMythic(
      stats,
      P.legR,
      P.legM,
      mult,
      ["Legendary rare", "Legendary mythic"],
      nf,
    );
    slots.push({
      n: 1,
      title: "Legendary",
      types: "Legendary creature or planeswalker",
      affects: M,
      outcomes: (
        [
          {
            pool: P.legU,
            label: "Legendary uncommon",
            p: 1 - pRM,
            foil: 0,
            formula: "1 − rare/mythic chance",
          },
        ] as Outcome[]
      ).concat(
        scale(legRM, pRM).map((o) => ({
          ...o,
          formula: `31%${fx} rare/mythic, then ${
            o.label.endsWith("mythic") ? "mythic" : "rare"
          } share`,
        })),
      ),
    });
    const pBR = clamp01((1 / 12) * mult);
    const hasBg = !stats || (stats.bgCU || 0) + (stats.bgR || 0) > 0;
    slots.push({
      n: 1,
      title: "Background",
      affects: M,
      types: hasBg
        ? "Legendary Background enchantment"
        : "Legendary creature or planeswalker (this set has no Backgrounds)",
      outcomes: [
        {
          pool: P.bgCU,
          label: hasBg ? "Common/uncommon Background" : "Legendary uncommon",
          p: 1 - pBR,
          foil: 0,
          formula: "1 − rare chance",
        },
        {
          pool: P.bgR,
          label: hasBg ? "Rare Background" : "Legendary rare",
          p: pBR,
          foil: 0,
          formula: `1 in 12 packs${fx}`,
        },
      ],
    });
    slots.push(nlRare());
    slots.push(foilAny(0));
  } else if (layout === "cmm") {
    slots.push(common(10), piperSlot(), nlUnc(3));
    slots.push({
      n: 2,
      title: "Legendary uncommon",
      types: "Legendary creature or planeswalker, uncommon",
      outcomes: [{ pool: P.legU, label: "Legendary uncommon", p: 1, foil: 0 }],
    });
    slots.push({
      n: 1,
      title: "Legendary rare or mythic",
      types: "Legendary creature or planeswalker, rare or mythic",
      affects: M,
      outcomes: rareMythic(
        stats,
        P.legR,
        P.legM,
        mult,
        ["Legendary rare", "Legendary mythic"],
        nf,
      ),
    });
    slots.push(nlRare());
    const pFlex = clamp01((1 / 3) * mult);
    const flexRM = rareMythic(
      stats,
      "rares",
      "mythics",
      mult,
      ["Rare", "Mythic"],
      nf,
    );
    slots.push({
      n: 1,
      title: "Uncommon or rare",
      types: "Nonlegendary uncommon, rare or mythic",
      affects: M,
      outcomes: (
        [
          {
            pool: "uncommons",
            label: "Uncommon",
            p: 1 - pFlex,
            foil: 0,
            formula: "2 in 3 packs" + (mult > 1 ? " (reduced by fun)" : ""),
          },
        ] as Outcome[]
      ).concat(
        scale(flexRM, pFlex).map((o) => ({
          ...o,
          formula: `1 in 3${fx}, then ${
            o.label === "Mythic" ? "mythic" : "rare"
          } share`,
        })),
      ),
    });
    slots.push(foilAny(0));
  }
  return finalizeSlots(slots, stats);
}
