/*
 * The printable PDF: US Letter or A4, 3×3 cards at 63×88 mm, the same card
 * layout MTGProxyPrinter's own PDF export uses.
 *
 * Three things are added on top of that layout. Each card's rounded corners
 * are filled and its edge pixels are stretched outward as bleed (see
 * `images.ts`), with the bleed clipped away on any side that touches a
 * neighbouring card — so bleed only appears at the outside of the grid, where
 * a cut can miss. Every card corner is marked with a crosshair drawn in
 * "difference" blend mode, which inverts whatever is under it, so the mark is
 * visible on a black border and on a white one. And the outside corners of the
 * printed area carry short crop marks in the margin, which is the one guide
 * the crosshairs cannot give, because they stop at the grid.
 *
 * A backs PDF uses exactly the same pages with every position mirrored, so
 * printing it on the reverse puts each back behind its own card.
 *
 * pdf-lib is a dynamic import: a run that only wants the CSV never downloads it.
 */
import type * as PdfLib from "pdf-lib";

import type { PackEntry } from "@/lib/generate";

import {
  browserImageLoader,
  mapLimit,
  type ImageLoader,
  type PreparedImage,
} from "./images";
import {
  expandFaces,
  layoutPages,
  placementsFor,
  rotationMatrix,
  type DfcMode,
  type Flip,
  type Quality,
  type Side,
} from "./layout";
import { CARD_PT, GRID, MM, PAPER, PT_PER_PX, type PaperName } from "./paper";

export interface PdfOptions {
  side?: Side;
  paper?: PaperName;
  bleedMm?: number;
  newPagePerPack?: boolean;
  quality?: Quality;
  /** 2× AI upscale of card faces. Plain card backs are never upscaled. */
  enhance?: boolean;
  dfcMode?: DfcMode;
  /** Backs only. */
  flip?: Flip;
  /**
   * Turn everything on the page, in degrees about the page's centre.
   *
   * The other half of duplex registration. An offset cannot fix a sheet that
   * is square at one end and out at the other: that is the two sides going
   * through at slightly different angles, and only an angle cancels it.
   */
  rotationDeg?: number;
  /**
   * Shift everything on the page, in millimetres: +x toward the right edge,
   * +y toward the top.
   *
   * For duplex registration. No printer puts the second side exactly behind
   * the first, so the backs sheet is nudged until it does. The whole grid
   * moves together — images, crosshairs and crop marks — because the point is
   * to move the printed sheet relative to the paper, not the cards relative
   * to their own guides.
   */
  offsetXMm?: number;
  offsetYMm?: number;
  customBackUrl?: string | null;
  /** Defaults to on, except the fronts of a "front only" double-sided sheet. */
  cutLines?: boolean;
  title?: string;
  onProgress?: (done: number, total: number) => void;
  /** Swapped out by the tests, which have no canvas. */
  imageLoader?: ImageLoader;
  /** Swapped out by the parity harness, which records the drawing calls. */
  pdfLib?: typeof PdfLib;
}

/** "url|bleedPx|scale" → the converted image. Kept across exports. */
const imageCache = new Map<string, Promise<PreparedImage>>();

export async function buildPdf(
  packs: PackEntry[][],
  opts: PdfOptions = {},
): Promise<Uint8Array> {
  const {
    PDFDocument,
    rgb,
    BlendMode,
    pushGraphicsState,
    popGraphicsState,
    rectangle,
    clip,
    endPath,
    concatTransformationMatrix,
  } = opts.pdfLib ?? (await import("pdf-lib"));
  const paper = PAPER[opts.paper as PaperName] || PAPER.letter;
  const bleed = Math.max(0, Number(opts.bleedMm) || 0) * MM;
  const bleedPx = Math.round(bleed / PT_PER_PX);
  const loader = opts.imageLoader || browserImageLoader;
  const quality: Quality = opts.quality || "high";
  const dfcMode: DfcMode = opts.dfcMode || "separate";
  const side: Side = opts.side || "front";
  const pages = layoutPages(
    expandFaces(packs, dfcMode),
    !!opts.newPagePerPack,
  ).map((cards) =>
    placementsFor(cards, {
      side,
      quality,
      dfcMode,
      enhance: opts.enhance,
      flip: opts.flip,
      customBackUrl: opts.customBackUrl,
    }),
  );
  /*
   * With "front only" the sheet is printed double-sided, so the cut lines go
   * on the backs only: on the fronts they would print over the card faces.
   */
  const drawCutLines =
    opts.cutLines !== undefined
      ? opts.cutLines
      : !(side !== "back" && dfcMode === "frontOnly");

  // Download and convert each distinct image once, cached across exports.
  const enhanceUrls = new Set(
    pages
      .flat()
      .filter((p) => p.enhance)
      .map((p) => p.url),
  );
  const urls = [
    ...new Set(
      pages
        .flat()
        .map((p) => p.url)
        .filter((u): u is string => !!u),
    ),
  ];
  let done = 0;
  const report = () => opts.onProgress?.(done, urls.length);
  report();
  const images = new Map<string, PreparedImage>();
  await mapLimit(urls, 6, async (url) => {
    const enhance = enhanceUrls.has(url);
    const key = url + "|" + bleedPx + "|" + (enhance ? "2x" : "1x");
    if (!imageCache.has(key)) {
      imageCache.set(
        key,
        loader(url, bleedPx, enhance).catch((e: unknown) => {
          imageCache.delete(key);
          throw e;
        }),
      );
    }
    images.set(url, await imageCache.get(key)!);
    done++;
    report();
  });

  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title || "Booster packs");
  pdf.setCreator("MTG Booster Generator");
  const embedded = new Map<string, PdfLib.PDFImage>();
  const offsetX = (Number(opts.offsetXMm) || 0) * MM;
  const offsetY = (Number(opts.offsetYMm) || 0) * MM;
  const x0 = (paper.w - GRID.cols * CARD_PT.w) / 2 + offsetX;
  // The top edge of the grid. A PDF's origin is its bottom-left corner, so a
  // positive y offset moves the grid up the page.
  const yTop = paper.h - (paper.h - GRID.rows * CARD_PT.h) / 2 + offsetY;
  const cellX = (col: number) => x0 + col * CARD_PT.w;
  const cellY = (row: number) => yTop - (row + 1) * CARD_PT.h;

  const rotation = Number(opts.rotationDeg) || 0;

  for (const placed of pages) {
    const page = pdf.addPage([paper.w, paper.h]);
    /*
     * Everything on the page turns together, so it is one transform around
     * the whole page rather than a rotation on each thing drawn. Left out
     * entirely at zero, which keeps an unrotated page byte-identical to what
     * it was before this existed.
     */
    if (rotation)
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          ...rotationMatrix(rotation, paper.w / 2, paper.h / 2),
        ),
      );
    const taken = new Set(placed.map((p) => p.row * GRID.cols + p.col));
    const occupied = (c: number, r: number) =>
      c >= 0 &&
      c < GRID.cols &&
      r >= 0 &&
      r < GRID.rows &&
      taken.has(r * GRID.cols + c);

    /*
     * Crop marks at the four corners of the printed area, drawn under the
     * cards so the bleed covers the part that gets trimmed away.
     *
     * MTGProxyPrinter rules its cut lines right across the page, and so did
     * this app until now. The crosshairs below already mark every card corner,
     * including the ones on the outside edge, so full-page rules were a second
     * set of guides for the same cuts — and a noisy one. What is left is the
     * usual printer's bracket: a short arm each way at the outside corners of
     * whatever is actually on this page, which is the one thing the crosshairs
     * cannot give you, because they stop at the grid.
     *
     * A 5 mm arm always has room: the tightest margin this grid leaves is
     * 7.6 mm, above and below the page on US Letter. The tests check that the
     * marks stay on the paper rather than the code defending against it.
     */
    if (drawCutLines) {
      const line = { thickness: 0.4, color: rgb(0, 0, 0) };
      const arm = 5 * MM;
      const cols = placed.map((p) => p.col);
      const rows = placed.map((p) => p.row);
      const left = x0 + Math.min(...cols) * CARD_PT.w;
      const right = x0 + (Math.max(...cols) + 1) * CARD_PT.w;
      const top = yTop - Math.min(...rows) * CARD_PT.h;
      const bottom = yTop - (Math.max(...rows) + 1) * CARD_PT.h;
      const mark = (
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) => page.drawLine({ start: from, end: to, ...line });

      for (const x of [left, right]) {
        mark({ x, y: top }, { x, y: top + arm });
        mark({ x, y: bottom }, { x, y: bottom - arm });
      }
      for (const y of [top, bottom]) {
        mark({ x: left, y }, { x: left - arm, y });
        mark({ x: right, y }, { x: right + arm, y });
      }
    }

    // The cards. Each image carries its own bleed; it is clipped so the bleed
    // only shows on sides with no neighbouring card.
    for (const p of placed) {
      const img = p.url ? images.get(p.url) : undefined;
      if (!img || !p.url) continue;
      if (!embedded.has(p.url)) {
        embedded.set(p.url, await pdf.embedJpg(img.bytes));
      }
      const ib = (img.bleedPx || 0) * PT_PER_PX; // bleed baked into this image, in pt
      const l = occupied(p.col - 1, p.row) ? 0 : Math.min(bleed, ib);
      const r = occupied(p.col + 1, p.row) ? 0 : Math.min(bleed, ib);
      const t = occupied(p.col, p.row - 1) ? 0 : Math.min(bleed, ib);
      const b = occupied(p.col, p.row + 1) ? 0 : Math.min(bleed, ib);
      const x = cellX(p.col);
      const y = cellY(p.row);
      page.pushOperators(
        pushGraphicsState(),
        rectangle(x - l, y - b, CARD_PT.w + l + r, CARD_PT.h + t + b),
        clip(),
        endPath(),
      );
      page.drawImage(embedded.get(p.url)!, {
        x: x - ib,
        y: y - ib,
        width: CARD_PT.w + 2 * ib,
        height: CARD_PT.h + 2 * ib,
      });
      page.pushOperators(popGraphicsState());
    }

    // Corner crosshairs on top of the cards. The corners are filled, so the
    // rounded corners no longer show where cards meet; these mark every card
    // corner instead.
    if (drawCutLines) {
      const arm = 2.5 * MM;
      const mark = {
        thickness: 0.6,
        color: rgb(1, 1, 1),
        blendMode: BlendMode.Difference,
      };
      const corners = new Set<string>();
      for (const p of placed) {
        for (const dc of [0, 1]) {
          for (const dr of [0, 1]) corners.add(`${p.col + dc},${p.row + dr}`);
        }
      }
      for (const key of corners) {
        const [c, r] = key.split(",").map(Number);
        const x = x0 + c * CARD_PT.w;
        const y = yTop - r * CARD_PT.h;
        page.drawLine({ start: { x: x - arm, y }, end: { x: x + arm, y }, ...mark });
        page.drawLine({ start: { x, y: y - arm }, end: { x, y: y + arm }, ...mark });
      }
    }

    if (rotation) page.pushOperators(popGraphicsState());
  }
  return pdf.save();
}
