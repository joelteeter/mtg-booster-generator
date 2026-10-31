/*
 * The print geometry every export shares.
 *
 * 63×88 mm cards, nine to a page, at the image size MTGProxyPrinter uses — so
 * a page from this app and a page from MTGProxyPrinter cut the same way.
 */

/** Scryfall's PNG size, which is 63×88 mm at 300 dpi. */
export const CARD_PX = { w: 745, h: 1040 } as const;

export const PT_PER_PX = 72 / 300;

/** 178.8 × 249.6 pt. */
export const CARD_PT = {
  w: CARD_PX.w * PT_PER_PX,
  h: CARD_PX.h * PT_PER_PX,
} as const;

export type PaperName = "letter" | "a4";

export const PAPER: Record<PaperName, { w: number; h: number; label: string }> =
  {
    letter: { w: 612, h: 792, label: "US Letter" },
    a4: { w: 595.28, h: 841.89, label: "A4" },
  };

export const GRID = { cols: 3, rows: 3 } as const;
export const PER_PAGE = GRID.cols * GRID.rows;

/** One millimetre in PDF points. */
export const MM = 72 / 25.4;
