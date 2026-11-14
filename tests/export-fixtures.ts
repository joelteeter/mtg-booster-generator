/*
 * Packs built by hand for the export parity sweep.
 *
 * The generator's own fixtures are realistic but incomplete for this layer:
 * what the export code branches on is whether a card has its own image, two
 * faces with images, a different card on its back, or no Scryfall id at all —
 * and a generated pack happens to contain only some of those. These are
 * assembled to hit every branch, and because the export functions are
 * deterministic given their entries, the same arrays go to both
 * implementations and only the outputs are compared.
 */
import type { ExportSettings } from "@/lib/export";
import type { PackEntry } from "@/lib/generate";
import type { Card } from "@/lib/scryfall/types";

let next = 1;
const uuid = (): string => {
  const n = (next++).toString(16).padStart(8, "0");
  return `${n}-1111-4222-8333-444455556666`;
};

const uris = (tag: string) => ({
  png: `https://img.test/${tag}.png`,
  large: `https://img.test/${tag}.jpg`,
});

/** An ordinary single-faced card. */
export const plain = (name: string, type = "Creature — Goblin"): Card =>
  ({ id: uuid(), name, type_line: type, image_uris: uris(name) }) as Card;

/** A card Scryfall gave no image urls for: the CDN path is derived from its id. */
export const noImages = (name: string): Card =>
  ({ id: uuid(), name, type_line: "Sorcery" }) as Card;

/** A double-faced card: no image of its own, both faces have one. */
export const dfc = (name: string): Card =>
  ({
    id: uuid(),
    name,
    card_faces: [
      { name: `${name} front`, image_uris: uris(`${name}-a`) },
      { name: `${name} back`, image_uris: uris(`${name}-b`) },
    ],
  }) as Card;

/** Two faces, but only the front has an image — not a double-faced card. */
export const oneSidedFaces = (name: string): Card =>
  ({
    id: uuid(),
    name,
    card_faces: [
      { name: `${name} front`, image_uris: uris(`${name}-a`) },
      { name: `${name} back` },
    ],
  }) as Card;

export const land = (name: string): Card =>
  ({
    id: uuid(),
    name,
    type_line: "Basic Land — Forest",
    image_uris: uris(name),
  }) as Card;

/**
 * Scryfall ids are lower case; one that is not proves the save file fixes it.
 * The id needs hex letters in it, or upper-casing a digits-only id changes
 * nothing and the test passes for the wrong reason.
 */
export const shouty = (name: string): Card =>
  ({
    id: `ABCDEF${(next++ % 256).toString(16).padStart(2, "0").toUpperCase()}-1111-4222-8333-44445555AAAA`,
    name,
    type_line: "Instant",
    image_uris: uris(name),
  }) as Card;

/** No id at all, which the MTGProxyPrinter file cannot represent. */
export const idless = (name: string): Card =>
  ({ name, type_line: "Enchantment", image_uris: uris(name) }) as unknown as Card;

const entry = (card: Card, extra: Partial<PackEntry> = {}): PackEntry => ({
  card,
  finish: "nonfoil",
  slot: 1,
  label: "common",
  ...extra,
});

/**
 * Nine packs, between them covering every branch the export code takes:
 * exactly one page, a page and a bit, a pack longer than two pages, a
 * double-faced card in the middle and at the end of a page, a token separator
 * with a different card on its back, a double-sided token, a land separator,
 * a card with no image urls, a card with two faces but one image, and a single
 * card on its own page.
 */
export function exportPacks(): PackEntry[][] {
  next = 1;
  const pack = (cards: PackEntry[]) => cards;
  return [
    // Exactly one page.
    pack(Array.from({ length: 9 }, (_, i) => entry(plain(`p1c${i}`)))),
    // A page and a bit, with a double-faced card third.
    pack([
      entry(plain("p2c0")),
      entry(noImages("p2c1")),
      entry(dfc("p2dfc")),
      ...Array.from({ length: 7 }, (_, i) => entry(plain(`p2c${i + 3}`))),
    ]),
    // A double-faced card last, so "separate" pushes its back onto a new page.
    pack([
      ...Array.from({ length: 8 }, (_, i) => entry(plain(`p3c${i}`))),
      entry(dfc("p3dfc")),
    ]),
    // A land separator after a short pack.
    pack([
      entry(plain("p4c0")),
      entry(oneSidedFaces("p4faces")),
      entry(land("p4land"), { slot: null, label: "separator", bonus: true }),
    ]),
    // A token separator: a different token on the back.
    pack([
      entry(plain("p5c0")),
      entry(plain("p5c1"), {
        slot: null,
        label: "token separator",
        bonus: true,
        tokenSlot: true,
        backCard: plain("p5back"),
      }),
    ]),
    // A double-faced token, which is never split in two.
    pack([
      entry(dfc("p6token"), {
        slot: null,
        label: "token separator",
        bonus: true,
        tokenSlot: true,
      }),
      entry(shouty("p6c1")),
    ]),
    // A token sheet: pairs and a filler.
    pack([
      entry(plain("p7t0"), { tokenSlot: true, backCard: plain("p7t1") }),
      entry(dfc("p7t2"), { tokenSlot: true }),
      entry(plain("p7t3"), {
        tokenSlot: true,
        backCard: plain("p7t4"),
        filler: true,
      }),
    ]),
    // Longer than two pages, with two double-faced cards in it.
    pack([
      ...Array.from({ length: 6 }, (_, i) => entry(plain(`p8c${i}`))),
      entry(dfc("p8dfcA")),
      ...Array.from({ length: 6 }, (_, i) => entry(plain(`p8c${i + 7}`))),
      entry(dfc("p8dfcB")),
      entry(plain("p8last")),
    ]),
    // One card alone.
    pack([entry(plain("p9only"))]),
  ];
}

/** A pack with a card that has no Scryfall id, for the save file's refusal. */
export const packWithIdlessCard = (): PackEntry[][] => [
  [entry(plain("fine")), entry(idless("Nameless"))],
];

export interface ExportCase {
  name: string;
  side: "front" | "back";
  paper: "letter" | "a4";
  bleedMm: number;
  quality: "high" | "fast";
  dfcMode: "separate" | "frontOnly";
  flip?: "long" | "short";
  customBackUrl?: string | null;
  newPagePerPack?: boolean;
  enhance?: boolean;
  cutLines?: boolean;
}

/** The option combinations the sweep runs. */
export const exportCases: ExportCase[] = [
  { name: "fronts, letter, 2 mm", side: "front", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate" },
  { name: "fronts, a4, no bleed", side: "front", paper: "a4", bleedMm: 0, quality: "high", dfcMode: "separate" },
  { name: "fronts, 3 mm, fast images", side: "front", paper: "letter", bleedMm: 3, quality: "fast", dfcMode: "separate" },
  { name: "fronts, new page per pack", side: "front", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate", newPagePerPack: true },
  { name: "fronts, front-only (no cut lines)", side: "front", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "frontOnly" },
  { name: "fronts, front-only, cut lines forced on", side: "front", paper: "letter", bleedMm: 1, quality: "high", dfcMode: "frontOnly", cutLines: true },
  { name: "fronts, enhanced", side: "front", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate", enhance: true },
  { name: "backs, long edge", side: "back", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate", flip: "long" },
  { name: "backs, short edge", side: "back", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate", flip: "short" },
  { name: "backs, front-only, long edge", side: "back", paper: "a4", bleedMm: 2, quality: "high", dfcMode: "frontOnly", flip: "long" },
  { name: "backs, front-only, short edge, fast", side: "back", paper: "letter", bleedMm: 0, quality: "fast", dfcMode: "frontOnly", flip: "short" },
  { name: "backs, custom back image", side: "back", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate", flip: "long", customBackUrl: "blob:custom-back" },
  { name: "backs, custom back, front-only", side: "back", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "frontOnly", flip: "long", customBackUrl: "blob:custom-back" },
  { name: "backs, enhanced, front-only", side: "back", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "frontOnly", flip: "long", enhance: true },
  { name: "backs, new page per pack", side: "back", paper: "a4", bleedMm: 3, quality: "fast", dfcMode: "separate", flip: "short", newPagePerPack: true },
  { name: "fronts, cut lines forced off", side: "front", paper: "letter", bleedMm: 2, quality: "high", dfcMode: "separate", cutLines: false },
];

/*
 * The print settings, and the old element ids they were read from. This
 * mapping is the thing the export-run parity test checks either side of: both
 * implementations get the same settings, written the way each one expects.
 */
export function exportControlsFor(
  s: ExportSettings,
): Record<string, string | boolean> {
  return {
    pdfPaper: s.paper,
    pdfBleed: String(s.bleedMm),
    pdfQuality: s.quality,
    dfcMode: s.dfcMode,
    backFlip: s.flip,
    backImage: s.backImage,
    newPagePerPack: s.newPagePerPack,
    pdfEnhance: s.enhance,
  };
}

export const DEFAULT_SETTINGS: ExportSettings = {
  paper: "letter",
  bleedMm: 2,
  quality: "high",
  dfcMode: "separate",
  flip: "long",
  backImage: "standard",
  customBackUrl: null,
  newPagePerPack: false,
  enhance: false,
  backRotationDeg: 0,
  backOffsetXMm: 0,
  backOffsetYMm: 0,
};

/** Settings worth running every download button against. */
export const settingsCases: Array<{
  name: string;
  settings: ExportSettings;
}> = [
  { name: "the defaults", settings: DEFAULT_SETTINGS },
  {
    name: "A4, no bleed, fast images",
    settings: {
      ...DEFAULT_SETTINGS,
      paper: "a4",
      bleedMm: 0,
      quality: "fast",
    },
  },
  {
    name: "front-only, short-edge flip, a new page per pack",
    settings: {
      ...DEFAULT_SETTINGS,
      dfcMode: "frontOnly",
      flip: "short",
      newPagePerPack: true,
      bleedMm: 3,
    },
  },
  {
    name: "a custom card back",
    settings: {
      ...DEFAULT_SETTINGS,
      backImage: "custom",
      customBackUrl: "blob:my-own-back",
    },
  },
  {
    name: "a custom card back that was never chosen",
    settings: { ...DEFAULT_SETTINGS, backImage: "custom", customBackUrl: null },
  },
  {
    name: "AI enhance on",
    settings: { ...DEFAULT_SETTINGS, enhance: true },
  },
];
