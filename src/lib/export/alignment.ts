/*
 * The alignment test print: two pages you print double-sided to measure how
 * far your printer puts the second side out of register.
 *
 * No printer lands the back exactly behind the front. The error is a couple
 * of millimetres, it is consistent for a given printer and paper path, and it
 * is invisible until you cut — at which point every card is off-centre on one
 * side. This measures it in one sheet.
 *
 * How it reads: the front page draws a cross in the middle of each card. The
 * back page draws, at the same place, a pair of rulers ticked every
 * millimetre. Hold the printed sheet up to a light and the front's cross
 * falls somewhere on the back's rulers; where it falls is the error, and
 * typing its negative into the offsets cancels it.
 *
 * The geometry is deliberately the same as a real sheet — same card grid,
 * same mirroring, same offsets — so what you measure here is what the packs
 * will do. The current offsets are baked in, which makes the second print a
 * check rather than another guess.
 */
import type * as PdfLib from "pdf-lib";

import {
  backPageOffset,
  backPageRotation,
  rotationMatrix,
  type Flip,
  type Side,
} from "./layout";
import { CARD_PT, GRID, MM, PAPER, type PaperName } from "./paper";

/** How far the rulers reach either side of true, in millimetres. */
export const RULER_MM = 7;

export interface AlignmentPdfOptions {
  paper?: PaperName;
  /*
   * Not used to mirror anything: this sheet draws the same marks in all nine
   * cells, and a uniform grid is its own mirror, so a cell's rulers land
   * behind a cell's cross whichever way the paper turns over.
   *
   * It is needed for the offsets, which are written the way you read them —
   * fronts toward you — and so have to be turned around for the page they are
   * printed on, exactly as a real backs sheet does.
   */
  flip?: Flip;
  /**
   * Which side to draw. One side per file, because that is how they get
   * printed: the fronts, then the paper turned over, then the backs. A
   * two-page PDF makes the printer decide how to turn it over, which is the
   * very thing being measured.
   */
  side?: Side;
  /** The offsets being tested, as measured; applied to the back page. */
  offsetXMm?: number;
  offsetYMm?: number;
  /** The rotation being tested, as measured; applied to the back page. */
  rotationDeg?: number;
  /** Swapped out by the tests, which have no pdf-lib. */
  pdfLib?: typeof PdfLib;
}

/** Every card's centre, in the order a page is filled. */
function cellCentres(
  x0: number,
  yTop: number,
): Array<{ col: number; row: number; x: number; y: number }> {
  const out = [];
  for (let row = 0; row < GRID.rows; row++)
    for (let col = 0; col < GRID.cols; col++)
      out.push({
        col,
        row,
        x: x0 + (col + 0.5) * CARD_PT.w,
        y: yTop - (row + 0.5) * CARD_PT.h,
      });
  return out;
}

export async function buildAlignmentPdf(
  opts: AlignmentPdfOptions = {},
): Promise<Uint8Array> {
  const {
    PDFDocument,
    rgb,
    StandardFonts,
    pushGraphicsState,
    popGraphicsState,
    concatTransformationMatrix,
  } = opts.pdfLib ?? (await import("pdf-lib"));
  const paper = PAPER[opts.paper as PaperName] || PAPER.letter;
  const measured = backPageOffset(
    opts.flip,
    Number(opts.offsetXMm) || 0,
    Number(opts.offsetYMm) || 0,
  );
  const offsetX = measured.x * MM;
  const offsetY = measured.y * MM;

  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `Alignment test print (${opts.side === "back" ? "back" : "front"})`,
  );
  pdf.setCreator("MTG Booster Generator");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0, 0, 0);

  const baseX = (paper.w - GRID.cols * CARD_PT.w) / 2;
  const baseYTop = paper.h - (paper.h - GRID.rows * CARD_PT.h) / 2;

  {
    const side: Side = opts.side === "back" ? "back" : "front";
    const back = side === "back";
    const page = pdf.addPage([paper.w, paper.h]);
    const turn = back ? backPageRotation(Number(opts.rotationDeg) || 0) : 0;
    if (turn)
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          ...rotationMatrix(turn, paper.w / 2, paper.h / 2),
        ),
      );
    const x0 = baseX + (back ? offsetX : 0);
    const yTop = baseYTop + (back ? offsetY : 0);
    const line = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      thickness = 0.4,
    ) => page.drawLine({ start: a, end: b, thickness, color: ink });

    // The card grid, so the sheet is recognisably a page of cards.
    for (let c = 0; c <= GRID.cols; c++)
      line(
        { x: x0 + c * CARD_PT.w, y: yTop },
        { x: x0 + c * CARD_PT.w, y: yTop - GRID.rows * CARD_PT.h },
        0.25,
      );
    for (let r = 0; r <= GRID.rows; r++)
      line(
        { x: x0, y: yTop - r * CARD_PT.h },
        { x: x0 + GRID.cols * CARD_PT.w, y: yTop - r * CARD_PT.h },
        0.25,
      );

    for (const cell of cellCentres(x0, yTop)) {
      const { x, y } = cell;
      const reach = RULER_MM * MM;

      if (!back) {
        // A fine cross, long enough to cross the back's rulers.
        line({ x: x - reach, y }, { x: x + reach, y }, 0.5);
        line({ x, y: y - reach }, { x, y: y + reach }, 0.5);
        continue;
      }

      /*
       * Rulers: a tick every millimetre, a longer one every fifth, and no
       * numbers. Labelling both axes put the +5 of one next to the −5 of the
       * other at every corner, and two 5 pt numerals a millimetre apart are
       * worse than none. Counting ticks out from the middle is quick, and the
       * long ones at 5 mm make it quicker.
       */
      line({ x: x - reach, y }, { x: x + reach, y }, 0.25);
      line({ x, y: y - reach }, { x, y: y + reach }, 0.25);
      for (let mm = -RULER_MM; mm <= RULER_MM; mm++) {
        if (mm === 0) continue;
        const big = mm % 5 === 0;
        const t = (big ? 2.5 : 1.2) * MM;
        const w = big ? 0.5 : 0.25;
        line({ x: x + mm * MM, y: y - t }, { x: x + mm * MM, y: y + t }, w);
        line({ x: x - t, y: y + mm * MM }, { x: x + t, y: y + mm * MM }, w);
      }
    }

    /*
     * The heading goes in the margin above the grid, which is all there is:
     * nine cards fill a Letter page to within 7.6 mm top and bottom. It is
     * drawn from the unshifted origin so that it does not move with the
     * offset, and stays where it can be read.
     */
    const heading = back
      ? "BACK — ticks are 1 mm, long ticks 5 mm. Measure from this ruler's middle to the front's cross:" +
        " that is how far the backs must move, so type it in as you see it here (right +, up +)."
      : "FRONT — print this double-sided the way you print your packs, then hold it to a light with this side toward you.";
    page.drawText(heading, {
      x: baseX,
      y: baseYTop + 7,
      size: 7,
      font,
      color: ink,
    });

    if (turn) page.pushOperators(popGraphicsState());
  }

  return pdf.save();
}
