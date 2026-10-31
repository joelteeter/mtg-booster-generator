/*
 * Choosing and ordering the sets the pickers offer.
 *
 * Pure, so it is testable: the Scryfall `/sets` listing goes in, the grouped
 * and sorted options come out. Phase 3 renders these; the old version built
 * HTML strings inline in `js/main.js`, which is why none of it was testable.
 */
import { COMMANDER_SETS, isReleased, todayISO } from "@/lib/booster";

import type { ScryfallSet } from "./types";

/** Set types that can plausibly be opened as a booster. */
export const ALLOWED_SET_TYPES = [
  "expansion",
  "core",
  "masters",
  "draft_innovation",
];

/**
 * Set types built for Limited. The newest released set is often neither: on
 * 30 October 2026 it was Mystery Booster Commander Edition, which has 1 common,
 * 16 uncommons and no mythics at all, and would open the app on a pack it
 * cannot sensibly build. So the default prefers one of these and only falls
 * back to the newest of anything. This is deliberate — do not simplify it away.
 */
export const DRAFTABLE_SET_TYPES = ["expansion", "core"];

/**
 * Newest first. Compared as YYYY-MM-DD strings rather than as Dates, which
 * keeps time zones out of it and is deterministic for a set with no announced
 * date — those sort last. (`js/main.js` subtracted Dates here, which yields
 * NaN for a missing date and leaves the order unspecified. Every set that has
 * a date is ordered identically.)
 */
export function byNewest(a: ScryfallSet, b: ScryfallSet): number {
  const da = a.released_at || "",
    db = b.released_at || "";
  if (da === db) return a.code.localeCompare(b.code);
  if (!da) return 1;
  if (!db) return -1;
  return db.localeCompare(da);
}

/** Three-letter codes only: longer ones are promos and supplements. */
const isPickable = (s: ScryfallSet): boolean =>
  ALLOWED_SET_TYPES.includes(String(s.set_type)) && s.code.length === 3;

/**
 * Sets for the Play Booster picker. The official Commander sets are excluded
 * because the Commander tab offers them directly.
 */
export function playSets(all: ScryfallSet[]): ScryfallSet[] {
  const commanderCodes = Object.keys(COMMANDER_SETS);
  return all
    .filter((s) => isPickable(s) && !commanderCodes.includes(s.code))
    .sort(byNewest);
}

/**
 * Sets for the Commander "any set" picker, which can borrow a layout for any
 * set — the official Commander ones included.
 */
export function anySets(all: ScryfallSet[]): ScryfallSet[] {
  return all.filter(isPickable).sort(byNewest);
}

/**
 * Split into the two groups the picker shows. Unreleased sets are kept,
 * because a partly spoiled set is still worth simulating, but they are grouped
 * and marked so nobody picks one by accident.
 */
export interface GroupedSets {
  upcoming: ScryfallSet[];
  released: ScryfallSet[];
}

export function groupByRelease(
  sets: ScryfallSet[],
  today = todayISO(),
): GroupedSets {
  return {
    upcoming: sets.filter((s) => !isReleased(s, today)),
    released: sets.filter((s) => isReleased(s, today)),
  };
}

/**
 * The set the picker should open on: the newest released one built for
 * Limited, falling back to the newest released set of any allowed type, and to
 * nothing at all if none are out.
 */
export function defaultSet(
  sets: ScryfallSet[],
  today = todayISO(),
): ScryfallSet | null {
  const out = sets.filter((s) => isReleased(s, today)); // newest first
  return (
    out.find((s) => DRAFTABLE_SET_TYPES.includes(String(s.set_type))) ??
    out[0] ??
    null
  );
}

/** How a set reads in the picker, including the marker for an unreleased one. */
export function setLabel(set: ScryfallSet, today = todayISO()): string {
  const base = `${set.name} (${set.code.toUpperCase()})`;
  if (isReleased(set, today)) return base;
  return `🔜 ${base}${set.released_at ? ` — out ${set.released_at}` : ""}`;
}
