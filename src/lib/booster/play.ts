/*
 * Play Booster / Booster Pack structure.
 *
 * Slot order follows Wizards' "What Are Play Boosters?" — 1-6 common, 7 common
 * or Special Guest, 8-10 uncommon, 11 rare or mythic, 12 land, 13 wildcard,
 * 14 wildcard with a foil if it is a rare or mythic. The mtg.fandom wiki
 * contradicts Wizards on slots 11-13; Wizards is the one followed here.
 */
import {
  clamp01,
  finalizeSlots,
  rareMythic,
  rareMythicFoilSlot,
  scale,
  weightedTiers,
} from "./probability";
import type { Outcome, PlayOptions, Slot, SlotDraft, Stats } from "./types";

/*
 * Play Boosters launched with Murders at Karlov Manor. From MKM through
 * Bloomburrow, slot 7 could hold a card from The List; from Duskmourn on, it
 * is only a common or (1 in 64) a Special Guest.
 */
export const PLAY_BOOSTER_START = "2024-02-09";
export const LIST_ERA_END = "2024-09-27";

export function playSpec(opts: PlayOptions, stats: Stats | null): Slot[] {
  const v = opts.vanilla;
  const mult = v ? 1 : opts.mult;
  const slots: SlotDraft[] = [];
  const nf = { foil: 0 as const };

  slots.push({
    n: 6,
    title: "Common",
    types: "Any non-basic common",
    outcomes: [{ pool: "commons", label: "Common", p: 1, foil: 0 }],
  });

  // Slot 7
  let spgP: number, listP: number;
  if (v) {
    spgP = 1 / 64;
    listP = opts.listEra ? 0.125 - spgP : 0;
  } else {
    spgP = clamp01(0.015 * mult);
    listP = opts.listToggle ? Math.min(1 - spgP, 0.125 * mult) : 0;
  }
  // Fun mode upgrades the seventh common to an uncommon; the List and Special
  // Guest chances on top of it are unchanged.
  const baseWord = v ? "Common" : "Uncommon";
  const slot7: Outcome[] = [
    {
      pool: v ? "commons" : "uncommons",
      label: baseWord,
      p: 1 - spgP - listP,
      foil: 0,
    },
  ];
  if (listP > 0)
    slot7.push({
      pool: "LIST",
      label: "The List",
      tag: "The List",
      p: listP,
      foil: 0,
      formula: v ? "12.5% List slot minus Special Guests" : `12.5% × ${mult}`,
    });
  slot7.push({
    pool: "spg",
    label: "Special Guest",
    tag: "Special Guest",
    p: spgP,
    foil: 0,
    formula: v ? "1 in 64 packs" : `1.5% × ${mult}`,
  });
  slots.push({
    n: 1,
    affects: v ? [] : ["mult", "listToggle", "slotUpgrade"],
    title:
      listP > 0
        ? `${baseWord} / The List / Special Guest`
        : `${baseWord} or Special Guest`,
    types:
      (listP > 0
        ? `${baseWord} from the set, a card from The List, or a Special Guest`
        : `${baseWord} from the set, or a Special Guest`) +
      (v ? "" : " (fun mode upgrades the seventh common to an uncommon)"),
    outcomes: slot7,
  });

  if (v) {
    slots.push({
      n: 3,
      title: "Uncommon",
      types: "Any non-basic uncommon",
      outcomes: [{ pool: "uncommons", label: "Uncommon", p: 1, foil: 0 }],
    });
  } else {
    // Fun mode turns the third guaranteed uncommon into a guaranteed rare.
    slots.push({
      n: 2,
      title: "Uncommon",
      types: "Any non-basic uncommon",
      outcomes: [{ pool: "uncommons", label: "Uncommon", p: 1, foil: 0 }],
    });
    slots.push({
      n: 1,
      affects: ["slotUpgrade"],
      title: "Rare",
      types: "Any non-basic rare (fun mode upgrades the third uncommon)",
      outcomes: [{ pool: "rares", label: "Rare", p: 1, foil: 0 }],
    });
  }

  if (v) {
    slots.push({
      n: 1,
      title: "Rare or mythic",
      types: "Any non-basic rare or mythic",
      outcomes: rareMythic(stats, "rares", "mythics", 1, ["Rare", "Mythic"], nf),
    });
    /*
     * The land slot keeps its 20% foil under the 2027 rules. Wizards'
     * announcement is silent on the land slot, and Collector Booster God Packs
     * still list a foil land, so the published rate stands rather than a guess.
     */
    slots.push({
      n: 1,
      title: "Land",
      types: "Basic land, or one of the set's common dual lands",
      outcomes: [
        {
          pool: ["landBasics", "nonBasicLands", "commons"],
          label: "Basic land",
          p: 0.5,
          foil: 0.2,
          formula: "half of land slots (Duskmourn sheet); 20% foil",
        },
        {
          pool: "landDuals",
          label: "Common dual land",
          p: 0.5,
          foil: 0.2,
          formula:
            "half of land slots, if the set has common duals; 20% foil",
        },
      ],
    });
    const rm = rareMythic(stats, "rares", "mythics", 1, ["Rare", "Mythic"], nf);
    slots.push({
      n: 1,
      title: "Wildcard (non-foil)",
      types: "Any non-basic card of any rarity",
      outcomes: (
        [
          {
            pool: "commons",
            label: "Common",
            p: 0.18,
            foil: 0,
            formula: "≈18% (Duskmourn sheet)",
          },
          {
            pool: "uncommons",
            label: "Uncommon",
            p: 0.67,
            foil: 0,
            formula: "≈67% (Duskmourn sheet)",
          },
        ] as Outcome[]
      ).concat(
        scale(rm, 0.15).map((o) => ({
          ...o,
          formula:
            "≈15% rare/mythic, split " +
            (o.label === "Mythic" ? "by mythic share" : "by rare share"),
        })),
      ),
    });
    slots.push({
      n: 1,
      title: "Wildcard (foil if rare or mythic)",
      types:
        "Any non-basic card of any rarity; traditional foil only when it is a rare or mythic",
      outcomes: rareMythicFoilSlot(
        stats,
        { C: "commons", U: "uncommons", R: "rares", M: "mythics" },
        1,
      ),
    });
  } else {
    /*
     * Every card name equally likely at x1 (weights all 1), then each step up
     * weights rares and mythics more and commons less. The multiplier used to
     * do nothing here but switch commons off at x2, so x2 to x5 produced
     * identical wildcards.
     */
    const wild = (foil: number): Outcome[] =>
      weightedTiers(
        stats,
        [
          { pool: "commons", label: "Common", w: 1 / mult },
          { pool: "uncommons", label: "Uncommon", w: 1 },
          { pool: "rares", label: "Rare", w: mult },
          { pool: "mythics", label: "Mythic", w: mult },
        ],
        { foil },
      );
    /*
     * Same slot positions as vanilla (rare/mythic, land, wildcard, foil
     * wildcard) so a fun pack is laid out like a real one and the land never
     * lands next to the separator land that follows a pack.
     *
     * The set's own mythic share scaled by the multiplier, as vanilla and the
     * Commander boosters do. This used to be a flat 13%, which only looked
     * right for sets with the usual 2:1 rare-to-mythic sheet: it ignored the
     * actual pools, so "x1 (Standard Odds)" did not match vanilla, and a set
     * with more mythics than rares came out backwards.
     */
    slots.push({
      n: 1,
      title: "Rare or mythic",
      types: "Any non-basic rare or mythic",
      affects: ["mult"],
      outcomes: rareMythic(
        stats,
        "rares",
        "mythics",
        mult,
        ["Rare", "Mythic"],
        nf,
      ),
    });
    slots.push({
      n: 1,
      affects: ["landUpgrade"],
      title: "Land (upgraded)",
      types: "Random non-basic land from the set (replaces the basic)",
      outcomes: [
        {
          pool: ["nonBasicLands", "uncommons"],
          label: "Non-basic land",
          p: 1,
          foil: 0,
          formula:
            "falls back to an uncommon if the set has no non-basic lands",
        },
      ],
    });
    slots.push({
      n: 1,
      affects: ["mult"],
      title: "Wildcard",
      types:
        mult > 1
          ? "Any non-basic card; the multiplier weights rares and mythics up and commons down"
          : "Any non-basic card, every card name equally likely",
      outcomes: wild(0),
    });
    // Without the toggle this follows the 2027 rule (foil only on rare and
    // mythic); the toggle is a fun override that foils anything.
    slots.push({
      n: 1,
      affects: ["mult", "foilToggle"],
      title: opts.foilToggle
        ? "Wildcard (foil)"
        : "Wildcard (foil if rare or mythic)",
      types:
        "Same pool as the first wildcard" +
        (opts.foilToggle
          ? ", always foil"
          : "; foil only when rare or mythic"),
      outcomes: opts.foilToggle
        ? wild(1)
        : wild(0).map((o) => ({
            ...o,
            foil: /Rare|Mythic/.test(o.label) ? 1 : 0,
          })),
    });
  }
  return finalizeSlots(slots, stats);
}
