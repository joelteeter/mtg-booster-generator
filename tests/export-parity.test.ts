/*
 * The export pipeline, compared against `js/export.js` function for function.
 *
 * Both implementations are handed the same pack entries, the same fake image
 * loader and the same recording pdf-lib, so anything that differs is a
 * difference in this port. The sweep covers the page layout, the double-faced
 * expansion, the image urls, the mirrored back placements, every drawing call
 * on every page, the canvas corner-filling and bleed passes, and the SQLite
 * save file byte for byte.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";

import {
  CARD_PT,
  MM,
  PAPER,
  SCHEMA_V7,
  buildPdf,
  buildSaveFile,
  cardBackUrl,
  expandFaces,
  imageUrl,
  layoutPages,
  placementsFor,
  type DfcMode,
  type Quality,
} from "@/lib/export";
import type { PackEntry } from "@/lib/generate";

import {
  canvasRecorder,
  fakeImageLoader,
  legacyExporter,
  recordingPdfLib,
  splitCutGuides,
} from "./legacy-export";
import {
  dfc,
  exportCases,
  exportPacks,
  idless,
  land,
  noImages,
  oneSidedFaces,
  packWithIdlessCard,
  plain,
  shouty,
} from "./export-fixtures";

/* eslint-disable @typescript-eslint/no-explicit-any */

const packs = exportPacks();
const qualities: Quality[] = ["high", "fast"];
const dfcModes: DfcMode[] = ["separate", "frontOnly"];

/** Pages as names, which is what a layout difference actually looks like. */
const names = (pages: any[][]): string[][] =>
  pages.map((page) => page.map((e: any) => `${e.card.name}#${e.face ?? ""}`));

describe("the save-file schema", () => {
  it("is MTGProxyPrinter's document-v7, unchanged", () => {
    expect(SCHEMA_V7).toBe(legacyExporter.SCHEMA_V7);
  });
});

describe("layoutPages", () => {
  for (const newPagePerPack of [false, true]) {
    for (const perPage of [1, 2, 3, 4, 8, 9, 10]) {
      it(`fills pages ${perPage} at a time${newPagePerPack ? ", a new page per pack" : ""}`, () => {
        expect(names(layoutPages(packs, newPagePerPack, perPage))).toEqual(
          names(legacyExporter.layoutPages(packs, newPagePerPack, perPage)),
        );
      });
    }
  }

  it("defaults to nine to a page", () => {
    expect(names(layoutPages(packs, false))).toEqual(
      names(legacyExporter.layoutPages(packs, false)),
    );
  });

  it("drops nothing and keeps the order", () => {
    const flat = layoutPages(packs, false).flat();
    expect(flat).toEqual(packs.flat());
  });

  it("has no page longer than the limit", () => {
    for (const perPage of [1, 2, 3, 9]) {
      for (const page of layoutPages(packs, true, perPage)) {
        expect(page.length).toBeLessThanOrEqual(perPage);
      }
    }
  });
});

describe("expandFaces", () => {
  for (const mode of dfcModes) {
    it(`gives a double-faced card ${mode === "separate" ? "two slots" : "one"}`, () => {
      expect(names(expandFaces(packs, mode))).toEqual(
        names(legacyExporter.expandFaces(packs, mode)),
      );
    });

    it(`keeps every other field on the entry (${mode})`, () => {
      const mine = expandFaces(packs, mode).flat();
      const theirs = legacyExporter.expandFaces(packs, mode).flat();
      expect(mine).toEqual(theirs);
    });
  }
});

describe("imageUrl", () => {
  const cards = [
    plain("ordinary"),
    noImages("no urls"),
    dfc("two faces"),
    oneSidedFaces("one image"),
    land("a forest"),
    shouty("upper case id"),
    idless("no id"),
  ];
  for (const card of cards) {
    for (const quality of qualities) {
      for (const face of [0, 1] as const) {
        it(`"${card.name}", ${quality}, face ${face}`, () => {
          expect(imageUrl(card, quality, face)).toBe(
            legacyExporter.imageUrl(card, quality, face),
          );
        });
      }
    }
  }

  it("defaults to the front face", () => {
    const card = dfc("defaulting");
    expect(imageUrl(card, "high")).toBe(legacyExporter.imageUrl(card, "high"));
  });
});

describe("cardBackUrl", () => {
  for (const quality of qualities) {
    it(`is the standard Magic back (${quality})`, () => {
      // The old signature took a card and ignored it; this one leaves it out.
      expect(cardBackUrl(quality)).toBe(
        legacyExporter.cardBackUrl(plain("whatever"), quality),
      );
    });
  }
});

describe("placementsFor", () => {
  for (const c of exportCases) {
    it(c.name, () => {
      const pages = layoutPages(expandFaces(packs, c.dfcMode), false);
      const legacyPages = legacyExporter.layoutPages(
        legacyExporter.expandFaces(packs, c.dfcMode),
        false,
      );
      expect(pages.length).toBe(legacyPages.length);
      pages.forEach((page, i) => {
        expect(placementsFor(page, c)).toEqual(
          legacyExporter.placementsFor(legacyPages[i], c),
        );
      });
    });
  }
});

/*
 * `placementsFor` guards against a face-1 entry in "front only" mode, which
 * `buildPdf` can never produce because `expandFaces` is called with the same
 * mode. The guard is still part of the function's contract, so it is compared
 * with the pages deliberately expanded the other way.
 */
describe("placementsFor, with pages expanded in the other mode", () => {
  for (const flip of ["long", "short"] as const) {
    it(`does not print a back face behind itself (${flip} edge)`, () => {
      const opts = {
        side: "back" as const,
        quality: "high" as const,
        dfcMode: "frontOnly" as const,
        flip,
      };
      const pages = layoutPages(expandFaces(packs, "separate"), false);
      const legacyPages = legacyExporter.layoutPages(
        legacyExporter.expandFaces(packs, "separate"),
        false,
      );
      pages.forEach((page, i) => {
        expect(placementsFor(page, opts)).toEqual(
          legacyExporter.placementsFor(legacyPages[i], opts),
        );
      });
      // And a face-1 entry really is in there, or this proves nothing.
      expect(pages.flat().some((e) => e.face === 1)).toBe(true);
    });
  }
});

describe("buildPdf", () => {
  for (const c of exportCases) {
    it(`draws the same pages: ${c.name}`, async () => {
      const mine = recordingPdfLib();
      const theirs = recordingPdfLib();
      const myProgress: number[][] = [];
      const theirProgress: number[][] = [];

      await buildPdf(packs, {
        ...c,
        title: "a title",
        imageLoader: fakeImageLoader,
        pdfLib: mine.lib as any,
        onProgress: (done, total) => myProgress.push([done, total]),
      });

      (globalThis as any).PDFLib = theirs.lib;
      try {
        await legacyExporter.buildPdf(packs, {
          ...c,
          title: "a title",
          imageLoader: fakeImageLoader,
          onProgress: (done: number, total: number) =>
            theirProgress.push([done, total]),
        });
      } finally {
        delete (globalThis as any).PDFLib;
      }

      /*
       * The plain black lines are the one deliberate difference — full-page
       * rules there, four corner crop marks here — so they are compared
       * separately. Everything else still has to match call for call.
       */
      const mineGuides = splitCutGuides(mine.calls);
      const theirGuides = splitCutGuides(theirs.calls);
      expect(mineGuides.rest).toEqual(theirGuides.rest);
      expect(myProgress).toEqual(theirProgress);

      const pageCount = layoutPages(
        expandFaces(packs, c.dfcMode),
        !!c.newPagePerPack,
      ).length;
      const cuts =
        c.cutLines !== undefined
          ? c.cutLines
          : !(c.side !== "back" && c.dfcMode === "frontOnly");
      expect(mineGuides.guides).toHaveLength(cuts ? pageCount * 8 : 0);
    });
  }

  it("reports progress from zero up to the number of distinct images", async () => {
    const seen: number[][] = [];
    await buildPdf(packs, {
      side: "front",
      bleedMm: 2,
      imageLoader: fakeImageLoader,
      pdfLib: recordingPdfLib().lib as any,
      onProgress: (done, total) => seen.push([done, total]),
    });
    const total = seen[0][1];
    expect(seen[0]).toEqual([0, total]);
    expect(seen.at(-1)).toEqual([total, total]);
    expect(seen.map((s) => s[0])).toEqual(
      Array.from({ length: total + 1 }, (_, i) => i),
    );
  });

  it("draws nothing for no packs", async () => {
    const mine = recordingPdfLib();
    const theirs = recordingPdfLib();
    await buildPdf([], { pdfLib: mine.lib as any, imageLoader: fakeImageLoader });
    (globalThis as any).PDFLib = theirs.lib;
    try {
      await legacyExporter.buildPdf([], { imageLoader: fakeImageLoader });
    } finally {
      delete (globalThis as any).PDFLib;
    }
    expect(mine.calls).toEqual(theirs.calls);
  });
});

/*
 * The one place the port leaves the old app behind, at the user's request:
 * MTGProxyPrinter-style rules right across the page are gone, because the
 * crosshairs already mark every card corner. What is left is a printer's
 * bracket at the four outside corners of whatever is on the page.
 */
describe("crop marks", () => {
  const ARM = 5 * MM;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const sorted = (ns: number[]) => [...new Set(ns)].sort((a, b) => a - b);

  async function marks(
    pack: PackEntry[][],
    opts: Record<string, unknown> = {},
  ) {
    const rec = recordingPdfLib();
    await buildPdf(pack, {
      imageLoader: fakeImageLoader,
      pdfLib: rec.lib as any,
      ...opts,
    });
    return splitCutGuides(rec.calls).guides.map((g) => g[2]);
  }

  /** Where the printed area's edges fall, for a given paper and row span. */
  const edges = (paper: "letter" | "a4", rowsUsed: number) => {
    const p = PAPER[paper];
    const x0 = (p.w - 3 * CARD_PT.w) / 2;
    const yTop = p.h - (p.h - 3 * CARD_PT.h) / 2;
    return {
      left: x0,
      right: x0 + 3 * CARD_PT.w,
      top: yTop,
      bottom: yTop - rowsUsed * CARD_PT.h,
      paper: p,
    };
  };

  const fullPage: PackEntry[][] = [packs[0]]; // exactly nine cards

  it("brackets the four corners and nothing else", async () => {
    const m = await marks(fullPage, { paper: "letter", bleedMm: 2 });
    const e = edges("letter", 3);
    const corners = [
      [e.left, e.top],
      [e.right, e.top],
      [e.left, e.bottom],
      [e.right, e.bottom],
    ];
    expect(m).toHaveLength(8);
    for (const g of m) {
      // Every arm starts at one of the four corners…
      expect(
        corners.some(([x, y]) => near(g.start.x, x) && near(g.start.y, y)),
      ).toBe(true);
      // …is exactly one arm long…
      const len = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
      expect(len).toBeCloseTo(ARM, 6);
      // …and points away from the cards, never across them.
      const outside =
        g.end.x < e.left || g.end.x > e.right ||
        g.end.y > e.top || g.end.y < e.bottom;
      expect(outside).toBe(true);
    }
    // Two arms at each corner: one along each edge.
    for (const [x, y] of corners) {
      expect(
        m.filter((g) => near(g.start.x, x) && near(g.start.y, y)),
      ).toHaveLength(2);
    }
  });

  for (const paper of ["letter", "a4"] as const) {
    it(`stays on the paper (${paper})`, async () => {
      const m = await marks(fullPage, { paper });
      const p = PAPER[paper];
      for (const g of m) {
        for (const pt of [g.start, g.end]) {
          expect(pt.x).toBeGreaterThanOrEqual(0);
          expect(pt.x).toBeLessThanOrEqual(p.w);
          expect(pt.y).toBeGreaterThanOrEqual(0);
          expect(pt.y).toBeLessThanOrEqual(p.h);
        }
      }
    });
  }

  it("follows the printed area on a part-filled page", async () => {
    // Five cards: two rows used, not three.
    const short: PackEntry[][] = [packs[0].slice(0, 5)];
    const m = await marks(short, { paper: "letter" });
    const e = edges("letter", 2);
    expect(m).toHaveLength(8);
    expect(m.some((g) => near(g.start.y, e.bottom))).toBe(true);
    expect(
      m.some((g) => near(g.start.y, edges("letter", 3).bottom)),
    ).toBe(false);
  });

  it("mirrors with the backs sheet, so the marks meet behind the cards", async () => {
    const short: PackEntry[][] = [packs[0].slice(0, 5)];
    const front = await marks(short, { paper: "letter", side: "front" });
    const back = await marks(short, {
      paper: "letter",
      side: "back",
      flip: "short",
    });
    const e = edges("letter", 3);
    // A short-edge flip turns the sheet over about the middle of the grid.
    const flip = (y: number) => e.top + e.bottom - y;
    const ys = (list: typeof front) => sorted(list.map((g) => round(g.start.y)));
    expect(ys(back)).toEqual(sorted(ys(front).map((y) => round(flip(y)))));
  });

  /*
   * A last page with one card is the case where the printed area is not the
   * whole grid horizontally: mirrored for the backs, that single card moves to
   * the far column, and the marks have to move with it.
   */
  it("brackets the mirrored column when a backs page holds one card", async () => {
    const one: PackEntry[][] = [packs[0].slice(0, 1)];
    const front = await marks(one, { paper: "letter", side: "front" });
    const back = await marks(one, {
      paper: "letter",
      side: "back",
      flip: "long",
    });
    const { left: gridLeft, right: gridRight } = edges("letter", 1);
    const xs = (list: typeof front) => sorted(list.map((g) => round(g.start.x)));
    expect(xs(front)).toEqual(
      sorted([gridLeft, gridLeft + CARD_PT.w].map(round)),
    );
    expect(xs(back)).toEqual(
      sorted([gridRight - CARD_PT.w, gridRight].map(round)),
    );
  });

  it("is left out when the sheet asks for no cut marks", async () => {
    expect(await marks(fullPage, { cutLines: false })).toEqual([]);
    // "Front only" puts them on the backs, so the fronts carry none.
    expect(await marks(fullPage, { dfcMode: "frontOnly" })).toEqual([]);
    expect(
      (await marks(fullPage, { dfcMode: "frontOnly", side: "back" })).length,
    ).toBe(8);
  });
});

/*
 * The canvas passes: filling the rounded corners and stretching the edge
 * pixels outward as bleed. This is the part the migration plan flagged as
 * having no safety net, because nobody can see it is wrong until a page is
 * printed. The pixels themselves cannot be compared outside a browser, but
 * every canvas call can be, and a wrong rectangle is what would actually go
 * wrong here.
 *
 * Each case uses its own card names so the url-keyed image caches inside both
 * implementations cannot serve an answer prepared by an earlier test.
 */
describe("the canvas corner and bleed passes", () => {
  const cases = [
    { name: "with a 2 mm bleed", bleedMm: 2 },
    { name: "with no bleed", bleedMm: 0 },
    { name: "with a 5 mm bleed", bleedMm: 5 },
  ];
  for (const c of cases) {
    it(`makes the same canvas calls ${c.name}`, async () => {
      const pack: PackEntry[][] = [
        [
          {
            card: plain(`canvas-${c.bleedMm}-a`),
            finish: "nonfoil",
            slot: 1,
            label: "common",
          },
        ],
      ];
      const mine = canvasRecorder();
      mine.install();
      try {
        await buildPdf(pack, {
          side: "front",
          bleedMm: c.bleedMm,
          pdfLib: recordingPdfLib().lib as any,
        });
      } finally {
        mine.restore();
      }

      const theirs = canvasRecorder();
      theirs.install();
      (globalThis as any).PDFLib = recordingPdfLib().lib;
      try {
        await legacyExporter.buildPdf(pack, {
          side: "front",
          bleedMm: c.bleedMm,
        });
      } finally {
        delete (globalThis as any).PDFLib;
        theirs.restore();
      }

      expect(mine.canvases).toEqual(theirs.canvases);
      expect(mine.canvases.length).toBeGreaterThan(0);
    });
  }

  /*
   * The one case that only shows up on an upscaled card: the bleed is grown
   * with the image, so a 2 mm bleed on a 2× card is 48 px, not 24 — and the
   * loader still reports it in 300 dpi units so the page layout is unchanged.
   */
  it("doubles the bleed with an upscaled card", async () => {
    const pack: PackEntry[][] = [
      [
        {
          card: plain("canvas-enhanced"),
          finish: "nonfoil",
          slot: 1,
          label: "common",
        },
      ],
    ];
    const minePdf = recordingPdfLib();
    const mine = canvasRecorder({ upscaler: true });
    mine.install();
    try {
      await buildPdf(pack, {
        side: "front",
        bleedMm: 2,
        enhance: true,
        pdfLib: minePdf.lib as any,
      });
    } finally {
      mine.restore();
    }

    const theirPdf = recordingPdfLib();
    const theirs = canvasRecorder({ upscaler: true });
    theirs.install();
    (globalThis as any).PDFLib = theirPdf.lib;
    try {
      await legacyExporter.buildPdf(pack, {
        side: "front",
        bleedMm: 2,
        enhance: true,
      });
    } finally {
      delete (globalThis as any).PDFLib;
      theirs.restore();
    }

    expect(mine.canvases).toEqual(theirs.canvases);
    expect(splitCutGuides(minePdf.calls).rest).toEqual(
      splitCutGuides(theirPdf.calls).rest,
    );
    // The card, the upscaled copy, and the upscaled copy with its bleed.
    const sizes = mine.canvases.map((c) => [c.width, c.height]);
    expect(sizes).toEqual([
      [745, 1040],
      [1490, 2080],
      [1490 + 96, 2080 + 96],
    ]);
  });

  it("fills four corners and, with a bleed, makes a larger second canvas", async () => {
    const pack: PackEntry[][] = [
      [
        {
          card: plain("canvas-shape"),
          finish: "nonfoil",
          slot: 1,
          label: "common",
        },
      ],
    ];
    const rec = canvasRecorder();
    rec.install();
    try {
      await buildPdf(pack, {
        side: "front",
        bleedMm: 2,
        pdfLib: recordingPdfLib().lib as any,
      });
    } finally {
      rec.restore();
    }
    const [card, out] = rec.canvases;
    expect([card.width, card.height]).toEqual([745, 1040]);
    expect(card.ops.filter((o) => o[0] === "fillRect")).toHaveLength(4);
    // 2 mm at 300 dpi is 24 px, on every side.
    expect([out.width, out.height]).toEqual([745 + 48, 1040 + 48]);
    expect(out.ops.filter((o) => o[0] === "drawImage")).toHaveLength(9);
  });
});

describe("buildSaveFile", () => {
  const sql = initSqlJs();

  /*
   * `js/export.js` already had a seam for this: it uses `__SQL_FOR_TESTS` in
   * place of the sql.js it would otherwise fetch from a CDN. The port takes
   * the same instance through `opts.sql`, so both write their database with
   * one SQLite build and the bytes can be compared directly.
   */
  beforeAll(async () => {
    (globalThis as any).__SQL_FOR_TESTS = await sql;
  });
  afterAll(() => {
    delete (globalThis as any).__SQL_FOR_TESTS;
  });

  /** Every row the file holds, which is what MTGProxyPrinter reads back. */
  const rows = (bytes: Uint8Array, SQL: any) => {
    const db = new SQL.Database(bytes);
    try {
      return {
        pages: db.exec("SELECT page, image_size FROM Page ORDER BY page")[0]
          ?.values,
        cards: db.exec(
          "SELECT page, slot, is_front, type, scryfall_id FROM Card ORDER BY page, slot",
        )[0]?.values,
        version: db.exec("PRAGMA user_version")[0]?.values,
      };
    } finally {
      db.close();
    }
  };

  for (const dfcMode of dfcModes) {
    for (const newPagePerPack of [false, true]) {
      it(`writes the same database: ${dfcMode}${newPagePerPack ? ", a new page per pack" : ""}`, async () => {
        const SQL = await sql;
        const opts = { dfcMode, newPagePerPack, sql: SQL };
        const mine = await buildSaveFile(packs, opts);
        const theirs = await legacyExporter.buildSaveFile(packs, {
          dfcMode,
          newPagePerPack,
        });
        expect(rows(mine, SQL)).toEqual(rows(theirs, SQL));
        expect(Array.from(mine)).toEqual(Array.from(theirs));
      });
    }
  }

  it("honours a page size other than nine", async () => {
    const SQL = await sql;
    const mine = await buildSaveFile(packs, { perPage: 4, sql: SQL });
    const theirs = await legacyExporter.buildSaveFile(packs, { perPage: 4 });
    expect(rows(mine, SQL)).toEqual(rows(theirs, SQL));
  });

  it("records the card image size MTGProxyPrinter expects", async () => {
    const SQL = await sql;
    const file = await buildSaveFile(packs, { sql: SQL });
    expect(rows(file, SQL).pages?.[0]).toEqual([1, "745x1040"]);
  });

  it("lower-cases a Scryfall id", async () => {
    const SQL = await sql;
    const file = await buildSaveFile([[...packs[5]]], { sql: SQL });
    const ids = rows(file, SQL).cards?.map((r: any[]) => r[4]) as string[];
    expect(ids.every((id) => id === id.toLowerCase())).toBe(true);
  });

  it("refuses a card with no Scryfall id, with the same message", async () => {
    const SQL = await sql;
    const bad = packWithIdlessCard();
    const mineError = await buildSaveFile(bad, { sql: SQL }).catch(
      (e: Error) => e.message,
    );
    const theirError = await legacyExporter
      .buildSaveFile(bad)
      .catch((e: Error) => e.message);
    expect(mineError).toBe(theirError);
    expect(mineError).toContain("has no Scryfall ID");
  });
});
