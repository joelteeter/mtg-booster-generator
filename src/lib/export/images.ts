/*
 * Card images, prepared for printing.
 *
 * Two things happen to every card before it goes in a PDF:
 *
 *   • its transparent rounded corners are filled with the colour just inside
 *     the corner, so a full-art card's corner continues its art instead of
 *     showing the paper (and so the corners do not show where cards meet);
 *   • the image is grown by a bleed on every side by repeating its outermost
 *     row and column of pixels outward, the way MTGProxyPrinter's bleed works,
 *     so a slightly-off cut does not leave a white strip.
 *
 * The canvas work itself cannot run outside a browser, so the geometry — which
 * rectangles get filled, and which strips get stretched where — is separated
 * out as plain arithmetic and compared against the old implementation's actual
 * canvas calls in `tests/export-parity.test.ts`. That part had no net at all
 * before: nobody can see it is wrong until they have printed a page.
 */
import type { Card } from "@/lib/scryfall/types";

import { upscaleCanvas } from "./enhance";
import { imageUrl, type Quality } from "./layout";
import { CARD_PX } from "./paper";

/** An image loaded and converted, ready to embed. */
export interface PreparedImage {
  bytes: Uint8Array;
  /** The bleed baked into these bytes, in 300 dpi pixels. */
  bleedPx: number;
}

export type ImageLoader = (
  url: string,
  bleedPx: number,
  enhance: boolean,
) => Promise<PreparedImage>;

/** One corner patch: the square to fill, and the pixel to sample its colour from. */
export interface CornerPatch {
  x: number;
  y: number;
  /** Top-left of the 8×8 block whose average colour fills the square. */
  sampleX: number;
  sampleY: number;
}

/** A little more than the corner radius, which is about 35 px. */
const CORNER = 42;
const SAMPLE = 8;

export function cornerPatches(w: number, h: number): CornerPatch[] {
  const r = CORNER;
  return [
    { x: 0, y: 0, sampleX: 14, sampleY: 14 },
    { x: w - r, y: 0, sampleX: w - 22, sampleY: 14 },
    { x: 0, y: h - r, sampleX: 14, sampleY: h - 22 },
    { x: w - r, y: h - r, sampleX: w - 22, sampleY: h - 22 },
  ];
}

export const cornerSize = (): { size: number; sample: number } => ({
  size: CORNER,
  sample: SAMPLE,
});

/** One `drawImage` of the bleed pass: a source rectangle and where it goes. */
export interface BleedDraw {
  src: [number, number, number, number];
  dst: [number, number, number, number];
}

/**
 * The nine draws that grow a `w`×`h` image by `b` pixels on every side: the
 * card itself in the middle, each edge's single row or column stretched out to
 * `b`, and each corner's single pixel stretched into a `b`×`b` block.
 */
export function bleedDraws(w: number, h: number, b: number): BleedDraw[] {
  return [
    { src: [0, 0, w, h], dst: [b, b, w, h] }, // the card
    { src: [0, 0, 1, h], dst: [0, b, b, h] }, // left
    { src: [w - 1, 0, 1, h], dst: [w + b, b, b, h] }, // right
    { src: [0, 0, w, 1], dst: [b, 0, w, b] }, // top
    { src: [0, h - 1, w, 1], dst: [b, h + b, w, b] }, // bottom
    { src: [0, 0, 1, 1], dst: [0, 0, b, b] }, // corners
    { src: [w - 1, 0, 1, 1], dst: [w + b, 0, b, b] },
    { src: [0, h - 1, 1, 1], dst: [0, h + b, b, b] },
    { src: [w - 1, h - 1, 1, 1], dst: [w + b, h + b, b, b] },
  ];
}

/**
 * The average colour of some pixels, ignoring the near-transparent ones — so
 * a sample that catches part of the rounded corner is not dragged towards
 * black. Black is the fallback, which is what a card's border is.
 */
export function averageColour(data: Uint8ClampedArray): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  return n
    ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
    : "rgb(0,0,0)";
}

/** Downloads a card image at 745×1040 with its corners filled. */
export async function preparedCard(url: string): Promise<HTMLCanvasElement> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const bmp = await createImageBitmap(await res.blob());
  const w = CARD_PX.w;
  const h = CARD_PX.h;

  const card = document.createElement("canvas");
  card.width = w;
  card.height = h;
  const c = card.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  c.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  // "destination-over" paints only where the card is transparent, which is
  // exactly the rounded corners.
  c.globalCompositeOperation = "destination-over";
  for (const patch of cornerPatches(w, h)) {
    const px = c.getImageData(patch.sampleX, patch.sampleY, SAMPLE, SAMPLE);
    c.fillStyle = averageColour(px.data);
    c.fillRect(patch.x, patch.y, CORNER, CORNER);
  }
  c.globalCompositeOperation = "source-over";
  return card;
}

/**
 * A card image as JPEG bytes, `bleedPx` pixels larger on every side.
 *
 * With `enhance` the card is AI-upscaled 2× (1490×2080, about 600 dpi) after
 * the corners are filled, and the bleed is doubled with it; `bleedPx` comes
 * back in 300 dpi units either way, so the PDF layout is unchanged.
 */
export const browserImageLoader: ImageLoader = async (
  url,
  bleedPx = 0,
  enhance = false,
) => {
  let card = await preparedCard(url);
  let scale = 1;
  if (enhance) {
    card = await upscaleCanvas(card);
    scale = 2;
  }
  const w = card.width;
  const h = card.height;
  const b = Math.max(0, Math.round(bleedPx)) * scale;

  let out = card;
  if (b > 0) {
    out = document.createElement("canvas");
    out.width = w + 2 * b;
    out.height = h + 2 * b;
    const o = out.getContext("2d") as CanvasRenderingContext2D;
    o.imageSmoothingEnabled = false;
    for (const { src, dst } of bleedDraws(w, h, b)) {
      o.drawImage(card, ...src, ...dst);
    }
  }
  const blob = await new Promise<Blob | null>((r) =>
    out.toBlob(r, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Could not convert the card image");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), bleedPx: b / scale };
};

/** Run `fn` over `items` with at most `limit` in flight, keeping the order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/*
 * The "Compare on one card" view: the same card plain-resized to 2× and
 * AI-upscaled, so the difference can be judged before committing to twenty
 * minutes of upscaling. It lives here rather than in `enhance.ts` because it
 * is image preparation and needs `preparedCard`; `enhance.ts` deliberately
 * depends on nothing in this file.
 */
export interface EnhanceComparison {
  plain: HTMLCanvasElement;
  enhanced: HTMLCanvasElement;
  /** How long the upscale took, in milliseconds. */
  ms: number;
}

export async function compareEnhance(
  card: Card,
  quality: Quality,
): Promise<EnhanceComparison> {
  const url = imageUrl(card, quality, 0);
  if (!url) throw new Error(`"${card.name}" has no image to enhance`);
  const base = await preparedCard(url);
  const t0 = performance.now();
  const enhanced = await upscaleCanvas(base);
  const ms = Math.round(performance.now() - t0);
  const plain = document.createElement("canvas");
  plain.width = enhanced.width;
  plain.height = enhanced.height;
  const p = plain.getContext("2d") as CanvasRenderingContext2D;
  p.imageSmoothingQuality = "high";
  p.drawImage(base, 0, 0, plain.width, plain.height);
  return { plain, enhanced, ms };
}

/** The rules-text box, where the difference between the two shows most. */
export function enhanceCrop(
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(w * 0.05),
    y: Math.round(h * 0.58),
    w: Math.round(w * 0.62),
    h: Math.round(h * 0.2),
  };
}
