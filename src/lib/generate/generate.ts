/*
 * Pack generation.
 *
 * A port of the body of `js/generate.js`'s Generate handler, with everything
 * it reached for out of global scope turned into an argument: the pools, the
 * slot spec, the separator picker, the random source, and the one request it
 * makes mid-generation (a random card from The List).
 *
 * That is the whole point of the shape. The old handler could only be run by
 * clicking a button in a browser with a live Scryfall behind it; this function
 * is deterministic given its `rng`, so the parity harness can seed both
 * implementations identically and compare the packs card for card.
 *
 * The one behavioural simplification: the old code read the options twice,
 * once before loading and once after (`freshOpts`), because set metadata could
 * arrive during the load and change `listEra`. Here the slots are built by
 * `useSpec` from the options and pools that are current when Generate is
 * pressed, so there is only one set of options and `slots` is already the
 * equivalent of the `freshOpts` spec.
 */
import {
  GOD_PACK_CHANCE,
  chooseOutcome,
  finishFor,
  isBoosterFun,
  nameKey,
  resolvePool,
  tokenSetCode,
  buildLandSheets,
  isBasicLand,
  nonFoilPools,
  nonFoilPrintings,
  tokenSheets as buildTokenSheets,
} from "@/lib/booster";
import type {
  Card as PureCard,
  NameMap,
  Outcome,
  Pools,
  Rng,
  Slot,
} from "@/lib/booster/types";
import { CSV_HEADER, formatToFullCSV } from "@/lib/csv";
import type { Card } from "@/lib/scryfall/types";

import type { BonusPicker, TokenSeparatorPicker } from "./separators";

/** One printed card in a generated pack. */
export interface PackEntry {
  card: Card;
  /** "nonfoil", "foil" or "etched". */
  finish: string;
  /** 1-based position in the pack, or null for the separator. */
  slot: number | null;
  /** The outcome's label, or what the separator is. */
  label: string;
  /** True for the separator, which is not part of the pack. */
  bonus?: boolean;
  /** A different card printed on the back — token separators and sheets. */
  backCard?: Card | null;
  tokenSlot?: boolean;
  /** Padding on the last token sheet rather than a token being covered. */
  filler?: boolean;
}

/**
 * One generated pack, or one token sheet.
 *
 * The old code hung `godPack` and `tokenSheet` as properties on the array of
 * cards itself. They are fields here, which is the same information written
 * down rather than smuggled.
 */
export interface GeneratedPack {
  cards: PackEntry[];
  godPack: boolean;
  /** 1-based sheet number, for the token sheets that follow the packs. */
  tokenSheet: number | null;
  /** 1-based sheet number, for the land sheet that follows those. */
  landSheet: number | null;
}

/** The CSV files the downloads table offers: index 0 is everything. */
export interface ExportFiles {
  /** Filename stems, without the extension. */
  base: string[];
  csv: string[];
}

export interface GenerateResult {
  packs: GeneratedPack[];
  exportFiles: ExportFiles;
  tokenSheetCount: number;
  landSheetCount: number;
}

/** The options the generator itself reads. A subset of the tab's options. */
export interface GenerateOptions {
  vanilla: boolean;
  guest: boolean;
  tokenSheets: boolean;
  /** Add a page of the set's basic lands after everything else. */
  landSheet?: boolean;
  /** Draw no printing that exists only as a foil. See `nonFoilPools`. */
  noFoils?: boolean;
}

export interface GenerateParams {
  /** Upper-case, as it appears in the filenames. */
  setCode: string;
  mode: "play" | "commander";
  /** "-CMRLayout" when a layout is borrowed for a non-Commander set, else "". */
  layoutTag: string;
  packCount: number;
  opts: GenerateOptions;
  pools: Pools;
  slots: Slot[];
  /** Play Boosters only: Commander draft boosters are not Booster Packs. */
  godSlots: Slot[] | null;
  rng: Rng;
  /** Already resolved, or null when no separator was asked for. */
  bonusPick: BonusPicker | TokenSeparatorPicker | null;
  separatorIsToken: boolean;
  /** The set's tokens, unsorted. Called only when `opts.tokenSheets`. */
  loadTokens?: () => Promise<Card[]>;
  /** Every land printing in the set, for the land sheet. */
  loadLands?: () => Promise<Card[]>;
  /** One random card from The List. Only called for a List outcome. */
  fetchList: () => Promise<Card>;
  /**
   * The progress line. Called with the same wording, in the same order, as
   * the old handler wrote into `#status`.
   */
  onStatus?: (message: string) => void;
  log?: (message: string) => void;
  onWarn?: (message: string) => void;
}

/*
 * Pools hold Scryfall cards; the pure layer's `NameMap` is typed with its own
 * looser `Card`. One cast here, as in `separators.ts`.
 */
const asCard = (c: PureCard | null): Card | null => c as Card | null;

/**
 * Pick a card from a pool: a name first, then one of its printings.
 *
 * `exclude` is the names already in this pack. Real packs are collated from
 * print sheets, so the same card essentially never appears twice in one — but
 * if *every* name is already used the exclusion is dropped rather than
 * returning nothing.
 *
 * `prefer` narrows the printings (not the names): a Booster Fun slot wants an
 * alternate treatment and falls back to whatever the card has if the set never
 * printed one.
 */
export function pickRandomVariant(
  nameMap: NameMap,
  exclude: Set<string> | null | undefined,
  prefer: ((card: PureCard) => boolean) | null,
  rng: Rng,
  log: (message: string) => void = () => {},
): Card | null {
  let names = Array.from(nameMap.keys());
  if (names.length === 0) return null;
  if (exclude && exclude.size) {
    const fresh = names.filter((n) => !exclude.has(n));
    if (fresh.length) names = fresh;
  }
  const randomName = names[Math.floor(rng() * names.length)];
  let variants = nameMap.get(randomName) as PureCard[];
  if (prefer) {
    const matching = variants.filter(prefer);
    if (matching.length) variants = matching;
  }
  const chosen = variants[Math.floor(rng() * variants.length)];
  if (variants.length > 1) {
    const ids = variants.map((v) => v.collector_number).join(", ");
    log(
      `Selection logic: Chose ID ${chosen.collector_number} out of available [${ids}] for card "${randomName}"`,
    );
  }
  return asCard(chosen);
}

export interface DrawDeps {
  pools: Pools;
  rng: Rng;
  fetchList: () => Promise<Card>;
  log: (message: string) => void;
  onWarn: (message: string) => void;
}

/**
 * Draw one card for one outcome.
 *
 * The List is the only outcome that is not in a pool: it is a live random
 * card from `set:plst`, and a failed request degrades to a common rather than
 * losing the card.
 */
export async function drawCard(
  outcome: Outcome,
  exclude: Set<string>,
  { pools, rng, fetchList, log, onWarn }: DrawDeps,
): Promise<Card | null> {
  const prefer = outcome.boosterFun ? isBoosterFun : null;
  if (outcome.pool === "LIST") {
    try {
      const card = await fetchList();
      log(`📜 The List: "${card.name}"`);
      return card;
    } catch (e) {
      onWarn(
        "The List fetch failed, using a common instead: " +
          (e instanceof Error ? e.message : String(e)),
      );
      return pickRandomVariant(
        pools.commons as NameMap,
        exclude,
        prefer,
        rng,
        log,
      );
    }
  }
  const map = resolvePool(pools, outcome.pool);
  return map ? pickRandomVariant(map, exclude, prefer, rng, log) : null;
}

export async function generatePacks({
  setCode,
  mode,
  layoutTag,
  packCount,
  opts,
  pools,
  slots,
  godSlots,
  rng,
  bonusPick,
  separatorIsToken,
  loadTokens,
  loadLands,
  fetchList,
  onStatus,
  log = (m) => console.log(m),
  onWarn = (m) => console.warn(m),
}: GenerateParams): Promise<GenerateResult> {
  /**
   * Prefer the Special Guest printing of a card half the time, when the
   * option is on and this set has one under that name.
   */
  /*
   * Narrowed once here rather than at each draw, so that everything reading a
   * pool gets the same cards: the slots, the Special Guest swap below, and
   * The List's fallback to a common. Names are all kept — only a name's list
   * of printings is narrowed, and only when it has a non-foil one.
   */
  const drawPools = opts.noFoils ? nonFoilPools(pools) : pools;

  const processCard = (card: Card | null): Card | null => {
    if (!card || !opts.guest) return card;
    const spgAll = drawPools.spgAll as NameMap | undefined;
    const guest = spgAll && spgAll.get(nameKey(card));
    if (guest && rng() < 0.5) {
      const g = guest[Math.floor(rng() * guest.length)];
      log(`✨ SWAP: Used Special Guest ID ${g.collector_number} for "${card.name}"`);
      return asCard(g);
    }
    return card;
  };

  const packs: GeneratedPack[] = [];
  const allRows: string[] = [];
  const packCsv: string[] = [];
  const label = mode === "play" ? "Booster" : `CommanderBooster${layoutTag}`;
  const allLabel =
    mode === "play" ? "AllBoosters" : `AllCommanderBoosters${layoutTag}`;

  for (let i = 1; i <= packCount; i++) {
    onStatus?.(`⏳ Building pack ${i} of ${packCount}...`);
    log(`--- Generating Pack ${i} ---`);
    const packRows: string[] = [];
    const packCards: PackEntry[] = [];
    const usedNames = new Set<string>();
    // An independent 1-in-1,000 roll for every pack, not one in each 1,000.
    const godPack = !!godSlots && rng() < GOD_PACK_CHANCE;
    if (godPack) log(`✨ GOD PACK: pack ${i} is all rares and mythics`);
    for (const slot of godPack ? (godSlots as Slot[]) : slots) {
      for (let k = 0; k < slot.n; k++) {
        const outcome = chooseOutcome(slot.outcomes, rng);
        if (!outcome) continue;
        const drawn = await drawCard(outcome, usedNames, {
          pools: drawPools,
          rng,
          fetchList,
          log,
          onWarn,
        });
        // Basics repeat freely; everything else is kept out of the same pack.
        if (drawn && !/Basic/.test(drawn.type_line || ""))
          usedNames.add(nameKey(drawn));
        const card = processCard(drawn);
        if (!card) continue;
        const finish = finishFor(outcome, rng);
        packRows.push(formatToFullCSV(card, finish));
        packCards.push({
          card,
          finish,
          slot: slot.from + k,
          label: outcome.label,
        });
      }
    }
    if (bonusPick) {
      const b = bonusPick();
      if (b.card) {
        const section = "section" in b ? b.section : null;
        packRows.push(formatToFullCSV(asCard(b.card) as Card, "nonfoil", section));
        // One card, two tokens: the back is a different card, so the CSV names
        // it too even though the two share the one printed slot.
        const backCard = "backCard" in b ? (b.backCard as Card | null) : null;
        if (backCard)
          packRows.push(formatToFullCSV(backCard, "nonfoil", section));
        packCards.push({
          card: asCard(b.card) as Card,
          finish: "nonfoil",
          slot: null,
          label: separatorIsToken ? "Token separator" : "Bonus land",
          bonus: true,
          ...(backCard
            ? { backCard, tokenSlot: true as const }
            : "tokenSlot" in b && b.tokenSlot
              ? { tokenSlot: true as const }
              : {}),
        });
      }
    }
    packs.push({ cards: packCards, godPack, tokenSheet: null, landSheet: null });
    allRows.push(...packRows);
    packCsv.push([CSV_HEADER, ...packRows].join("\n"));
  }

  /*
   * Every token in the set, over as many pages as it takes, each slot holding
   * one token on the front and a different one on the back.
   */
  let tokenSheetCount = 0;
  if (opts.tokenSheets) {
    onStatus?.(`⏳ Loading ${setCode} tokens...`);
    const loaded = loadTokens ? await loadTokens() : [];
    // Token sets carry surge-foil printings too (Final Fantasy's, for one).
    const tokens = opts.noFoils ? nonFoilPrintings(loaded) : loaded;
    if (!tokens.length)
      throw new Error(
        `${setCode} has no tokens on Scryfall ` +
          `(looked in ${tokenSetCode(setCode).toUpperCase()}).`,
      );
    const sheets = buildTokenSheets(tokens, 9, rng);
    tokenSheetCount = sheets.length;
    sheets.forEach((sheet, i) => {
      const rows: string[] = [];
      const cards: PackEntry[] = sheet.map((s, k) => {
        rows.push(formatToFullCSV(asCard(s.card) as Card, "nonfoil"));
        if (s.backCard)
          rows.push(formatToFullCSV(asCard(s.backCard) as Card, "nonfoil"));
        return {
          card: asCard(s.card) as Card,
          backCard: asCard(s.backCard ?? null),
          tokenSlot: true,
          filler: s.filler,
          finish: "nonfoil",
          slot: k + 1,
          label: s.filler ? "Token (filler)" : "Token",
        };
      });
      packs.push({ cards, godPack: false, tokenSheet: i + 1, landSheet: null });
      allRows.push(...rows);
      packCsv.push([CSV_HEADER, ...rows].join("\n"));
    });
  }

  /*
   * One page of the set's basic lands, after the packs and the token sheets.
   * Always drops the printings that exist only as a foil, whatever the foil
   * option says: this is a page you print, and a surge-foil basic printed
   * flat is the same art with the wrong frame.
   */
  let landSheetCount = 0;
  if (opts.landSheet) {
    onStatus?.(`⏳ Loading ${setCode} lands...`);
    const lands = nonFoilPrintings(loadLands ? await loadLands() : []);
    const sheets = buildLandSheets(lands, 9);
    if (!sheets.length) throw new Error(`${setCode} has no lands on Scryfall.`);
    landSheetCount = sheets.length;
    sheets.forEach((sheet, i) => {
      const rows = sheet.map((c) =>
        formatToFullCSV(asCard(c) as Card, "nonfoil"),
      );
      packs.push({
        cards: sheet.map((c, k) => ({
          card: asCard(c) as Card,
          finish: "nonfoil",
          slot: k + 1,
          label: c.full_art
            ? "Full-art land"
            : isBasicLand(c)
              ? "Basic land"
              : "Land",
        })),
        godPack: false,
        tokenSheet: null,
        landSheet: i + 1,
      });
      allRows.push(...rows);
      packCsv.push([CSV_HEADER, ...rows].join("\n"));
    });
  }

  /*
   * Named from each entry rather than from its index, because the sheets that
   * follow the packs are no longer all of one kind.
   */
  const exportFiles: ExportFiles = {
    base: [`${setCode}-${allLabel}-${packCount}`].concat(
      packs.map((p, i) =>
        p.tokenSheet
          ? `${setCode}-TokenSheet-${p.tokenSheet}`
          : p.landSheet
            ? `${setCode}-LandSheet-${p.landSheet}`
            : `${setCode}-${label}-${i + 1}`,
      ),
    ),
    csv: [[CSV_HEADER, ...allRows].join("\n")].concat(packCsv),
  };

  return { packs, exportFiles, tokenSheetCount, landSheetCount };
}
