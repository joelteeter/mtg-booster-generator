/*
 * The pure parts of the "How each card slot is determined" panel.
 *
 * Extracted from `js/ui.js`, where they were tangled up with HTML strings and
 * `document` lookups. Everything here is a value in and a value out, so the
 * panel's logic is testable even though its markup is not — and the old
 * implementations are still there to compare against until phase 6.
 *
 * Functions that produced HTML in the old code return structured data here;
 * React escapes text itself, so the old `esc` helper has no counterpart.
 */
import { expectedCounts, poolCount, resolvePool, usedPool } from "@/lib/booster";
import type {
  Card,
  DiffChange,
  Foil,
  NameMap,
  Outcome,
  Pools,
  Slot,
  Stats,
} from "@/lib/booster/types";

/** A percentage for display. Sub-0.1% is shown as "<0.1%", never as "0.0%". */
export const pct = (p: number | null | undefined): string =>
  p == null
    ? ""
    : p >= 0.9995
      ? "100%"
      : p * 100 < 0.1 && p > 0
        ? "<0.1%"
        : (p * 100).toFixed(1) + "%";

/** Rarity bucket for an outcome label, used to colour its chip. */
export type RarityKey =
  | "r-mythic"
  | "r-rare"
  | "r-uncommon"
  | "r-land"
  | "r-common"
  | "r-special";

export function rarityClass(label: string): RarityKey {
  if (/mythic/i.test(label)) return "r-mythic";
  if (/rare/i.test(label)) return "r-rare";
  if (/uncommon/i.test(label)) return "r-uncommon";
  if (/land/i.test(label)) return "r-land";
  if (/common/i.test(label)) return "r-common";
  return "r-special";
}

/** How a slot's finish reads: "20% traditional foil", "Non-foil", and so on. */
export function foilText(outcomes: Outcome[]): string {
  let pf = 0,
    pe = 0,
    unknown = false;
  outcomes.forEach((o) => {
    if (o.p == null) {
      unknown = true;
      return;
    }
    if (o.foil === "etched") pe += o.p;
    else pf += o.p * ((o.foil as number) || 0);
  });
  if (unknown) {
    // While the set is loading, say what can be said without the numbers.
    const all = outcomes.every((o) => o.foil === 1);
    const none = outcomes.every((o) => !o.foil);
    return all ? "Always (traditional foil)" : none ? "Non-foil" : "Sometimes";
  }
  const parts: string[] = [];
  if (pe > 0) parts.push(`${pct(pe)} foil-etched`);
  if (pf >= 0.9995)
    parts.push(pe > 0 ? "otherwise traditional foil" : "Always (traditional foil)");
  else if (pf > 0) parts.push(`${pct(pf)} traditional foil`);
  return parts.length ? parts.join(" · ") : "Non-foil";
}

export const foilWord = (f: Foil | undefined): string =>
  f === "etched"
    ? "foil-etched"
    : !f
      ? "non-foil"
      : f === 1
        ? "always foil"
        : pct(f as number) + " foil";

/** The List / Special Guest / Piper markers in a slot, with their chances. */
export interface TaggedOutcome {
  tag: string;
  p: number | null;
}

export const taggedOutcomes = (outcomes: Outcome[]): TaggedOutcome[] =>
  outcomes
    .filter((o) => o.tag)
    .map((o) => ({ tag: o.tag as string, p: o.p }));

/** Readable names for the pools a fallback chain can land on. */
export const POOL_NAMES: Record<string, string> = {
  legC: "legendary commons",
  legU: "legendary uncommons",
  legR: "legendary rares",
  legM: "legendary mythics",
  legAll: "any legendary creature/planeswalker",
  uncommons: "nonlegendary uncommons",
  rares: "nonlegendary rares",
  commons: "commons",
  nonBasicLands: "non-basic lands",
  landBasics: "basic lands",
  landDuals: "common dual lands",
  etched: "foil-etched legends",
};

/** Readable names for the fun options a slot can be affected by. */
export const FUN_NAMES: Record<string, string> = {
  mult: "multiplier",
  foilToggle: "foil toggle",
  listToggle: "List toggle",
  landUpgrade: "land upgrade",
  slotUpgrade: "slot upgrades",
};

/** Options that matter to the panel. A subset of the full options object. */
export interface ExplainOpts {
  vanilla: boolean;
  mult: number;
  guest?: boolean;
  foilToggle?: boolean;
  listToggle?: boolean;
  listEra?: boolean;
  released?: string | null;
  includeBonus?: boolean;
  separatorType?: string;
  bonusType?: string;
  tokenSheets?: boolean;
  noFoils?: boolean;
}

/** Which of this tab's options are responsible for a slot differing. */
export function slotOptionNames(slot: Slot, opts: ExplainOpts): string[] {
  if (opts.vanilla || !slot.affects || !slot.affects.length) return [];
  return slot.affects
    .filter((t) => t !== "foilToggle" || opts.foilToggle)
    .filter((t) => t !== "listToggle" || opts.listToggle)
    .map((t) => FUN_NAMES[t]);
}

/**
 * The same options with every fun option switched off, so the current spec can
 * be compared against the official layout for the same set.
 */
export function vanillaOpts<T extends ExplainOpts>(opts: T): T {
  return {
    ...opts,
    vanilla: true,
    mult: 1,
    guest: false,
    foilToggle: false,
    listToggle: false,
  };
}

/** A foil change that several rarities made together. */
export type CollapsedChange = DiffChange & { labels?: string[] };

/**
 * Outcomes in a slot usually gain or lose foil together; say that once instead
 * of repeating the same sentence for every rarity.
 */
export function collapseChanges(changes: DiffChange[]): CollapsedChange[] {
  const out: CollapsedChange[] = [],
    byShift = new Map<string, CollapsedChange>();
  for (const c of changes) {
    if (c.kind !== "foil") {
      out.push(c);
      continue;
    }
    const k = String(c.fromFoil) + ">" + String(c.toFoil);
    const seen = byShift.get(k);
    if (seen) (seen.labels as string[]).push(c.label);
    else {
      const merged: CollapsedChange = { ...c, labels: [c.label] };
      byShift.set(k, merged);
      out.push(merged);
    }
  }
  return out;
}

/**
 * One change record as the pieces a component renders, rather than as HTML.
 * `was` is the parenthetical "(vanilla: …)" aside where there is one.
 */
export type ChangeDescription =
  | { kind: "title"; title: string; was: string }
  | { kind: "added"; label: string; at: string }
  | { kind: "removed"; label: string; was: string }
  | { kind: "p"; label: string; from: string; to: string; direction: "up" | "down" }
  | { kind: "foil"; subject: string; collapsed: boolean; from: string; to: string };

export function describeChange(c: CollapsedChange): ChangeDescription {
  switch (c.kind) {
    case "title":
      return { kind: "title", title: c.toTitle, was: c.fromTitle };
    case "added":
      return { kind: "added", label: c.label, at: c.toP == null ? "" : pct(c.toP) };
    case "removed":
      return { kind: "removed", label: c.label, was: pct(c.fromP) || "possible" };
    case "p":
      return {
        kind: "p",
        label: c.label,
        from: pct(c.fromP),
        to: pct(c.toP),
        direction: c.toP > c.fromP ? "up" : "down",
      };
    case "foil": {
      const many = !!c.labels && c.labels.length > 1;
      return {
        kind: "foil",
        subject: many ? `All ${c.labels!.length} rarities` : c.label,
        collapsed: many,
        from: foilWord(c.fromFoil),
        to: foilWord(c.toFoil),
      };
    }
  }
}

/*
 * Most pools hold a single rarity, so the card count says it all. The non-basic
 * land pool does not: it is every land in the set, mostly commons with a few
 * rares, so spell the mix out rather than just "17 cards".
 */
const rarityMixCache = new WeakMap<NameMap, string>();
export function rarityMix(map: NameMap): string {
  if (!rarityMixCache.has(map)) {
    const counts: Record<string, number> = {};
    for (const variants of map.values()) {
      const r = variants[0].rarity as string | undefined;
      if (r) counts[r] = (counts[r] || 0) + 1;
    }
    const order = ["common", "uncommon", "rare", "mythic"];
    const parts = order.filter((r) => counts[r]).map((r) => `${counts[r]} ${r}`);
    rarityMixCache.set(map, parts.length > 1 ? parts.join(", ") : "");
  }
  return rarityMixCache.get(map) as string;
}

/*
 * Expected number of land cards per pack. Each outcome picks a card name
 * uniformly from its pool, so its land chance is (land names ÷ all names).
 */
const landShareCache = new WeakMap<NameMap, number>();
export function landShare(map: NameMap): number {
  if (!landShareCache.has(map)) {
    let n = 0;
    for (const variants of map.values())
      if (/\bLand\b/.test((variants[0] as Card).type_line || "")) n++;
    landShareCache.set(map, map.size ? n / map.size : 0);
  }
  return landShareCache.get(map) as number;
}

export function expectedLands(
  slots: Slot[],
  pools: Pools | null | undefined,
): number | null {
  if (!pools) return null;
  let total = 0;
  for (const s of slots)
    for (const o of s.outcomes) {
      if (o.p == null || o.pool === "LIST") continue;
      const map = resolvePool(pools, o.pool);
      if (map) total += s.n * o.p * landShare(map);
    }
  return total;
}

/** One "Rares + mythics: 1.09 per pack" chip. */
export interface ExpectedChip {
  label: string;
  value: number;
}

/**
 * The per-pack expectation chips under the slot table. Returns [] while the
 * set's counts are unknown, because every figure here depends on them.
 */
export function expectedChips(
  slots: Slot[],
  stats: Stats | null,
  pools: Pools | null | undefined,
  mode: "play" | "commander",
  opts: ExplainOpts,
): ExpectedChip[] {
  if (!stats) return [];
  const exp = expectedCounts(slots);
  const sum = (re: RegExp) =>
    Object.entries(exp)
      .filter(([k]) => re.test(k))
      .reduce((a, [, v]) => a + v, 0);

  const chips: ExpectedChip[] = [
    { label: "Rares + mythics", value: sum(/rare|mythic/i) },
    { label: "Mythics", value: sum(/mythic/i) },
  ];
  // With foils switched off this is 0 in every pack, which is a row of noise
  // rather than an expectation.
  if (!opts.noFoils) chips.push({ label: "Foils", value: exp.__foil || 0 });
  if (mode === "commander")
    chips.push({ label: "Legendaries", value: sum(/legend|background/i) });

  const lands = expectedLands(slots, pools);
  if (lands != null)
    chips.push({
      label:
        opts.includeBonus && opts.separatorType === "land"
          ? "Lands (+1 separator)"
          : "Lands",
      value: lands,
    });

  const sg = sum(/special guest|the list|piper/i);
  if (sg > 0)
    chips.push({
      label: mode === "play" ? "List / Special Guest" : "Prismatic Piper",
      value: sg,
    });
  return chips;
}

/** Card count and fallback note for one outcome's pool. */
export interface PoolNote {
  /** Distinct card names available, or null while the set is loading. */
  count: number | null;
  /**
   * Readable name of the pool actually supplying the slot, when a fallback
   * chain had to move off its first choice — "none in set → commons".
   */
  fellBackTo: string | null;
  /** "12 common, 3 rare" for a mixed pool; empty for a single-rarity one. */
  mix: string;
}

export function poolNote(
  outcome: Outcome,
  stats: Stats | null,
  pools: Pools | null | undefined,
): PoolNote {
  const n = stats ? poolCount(stats, outcome.pool) : null;
  const used = usedPool(stats, outcome.pool);
  const fellBack =
    !!stats && Array.isArray(outcome.pool) && used !== outcome.pool[0];
  const map = pools ? resolvePool(pools, outcome.pool) : null;
  return {
    // The List has no size, so its Infinity is reported as unknown.
    count: n != null && isFinite(n) ? n : null,
    fellBackTo: fellBack ? POOL_NAMES[used] || used : null,
    mix: map ? rarityMix(map) : "",
  };
}

/**
 * The last wildcard's own foil chance. Under the 2027 rules that is simply the
 * chance it comes out a rare or mythic (or 100% with the fun toggle on).
 */
export function lastSlotFoilChance(
  slots: Slot[],
  mode: "play" | "commander",
): number | null {
  const last = slots[slots.length - 1];
  if (mode !== "play" || !last || !last.outcomes.every((o) => o.p != null))
    return null;
  return last.outcomes.reduce(
    (a, o) => a + (o.foil === 1 ? (o.p as number) : 0),
    0,
  );
}

/** "7" or "8–10", the way a slot's card positions read in the table. */
export const slotRange = (slot: Slot): string =>
  slot.from === slot.to ? `${slot.from}` : `${slot.from}–${slot.to}`;

/** Positions of every slot a given option affects, for the modifier list. */
export const slotsAffectedBy = (slots: Slot[], tag: string): string =>
  slots
    .filter((s) => (s.affects || []).includes(tag))
    .map((s) => (s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`))
    .join(", ");
