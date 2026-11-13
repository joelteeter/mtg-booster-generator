/*
 * Stand-ins for the three things the export pipeline needs and Node has not.
 *
 *   • `fakeImageLoader` — a deterministic substitute for downloading and
 *     converting a card image, so a PDF is built from predictable bytes.
 *   • `recordingPdfLib` — a stub pdf-lib that records every drawing call
 *     instead of writing a file. Recording the calls pins the geometry
 *     exactly, with no PDF timestamps or compression in the way.
 *   • `canvasRecorder` — stub `document`, `fetch` and `createImageBitmap`, so
 *     the corner-filling and bleed passes run outside a browser and can be
 *     checked as canvas calls. This is the part the migration plan called the
 *     one with no safety net; it is also why the golden file exists.
 *
 * These were written to run the old app and the port side by side. The old
 * app is gone, but the doubles are what made its behaviour recordable, and
 * they are what makes the recording comparable.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ *
 * A deterministic image loader
 * ------------------------------------------------------------------ */

/**
 * Stands in for downloading a card image and converting it.
 *
 * The bytes are derived from the url, the bleed and the scale, so both
 * implementations embed byte-identical images and a wrong url shows up as a
 * different digest rather than a silent pass. Both implementations cache
 * loaded images by that same key, so the function must stay a pure function
 * of its arguments.
 */
export async function fakeImageLoader(
  url: string,
  bleedPx = 0,
  enhance = false,
): Promise<{ bytes: Uint8Array; bleedPx: number }> {
  let h = 2166136261;
  for (const ch of `${url}|${bleedPx}|${enhance}`) {
    h = ((h ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  }
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) bytes[i] = (h >>> (i % 4) * 8) & 0xff;
  // What the real loader reports: the bleed it baked in, in 300 dpi pixels.
  return { bytes, bleedPx: Math.max(0, Math.round(bleedPx)) };
}

const digest = (bytes: Uint8Array | ArrayLike<number>): string =>
  Array.from(bytes as ArrayLike<number>)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/* ------------------------------------------------------------------ *
 * A recording pdf-lib
 * ------------------------------------------------------------------ */

/** Rounded, so a readable diff is not drowned in floating-point noise. */
const num = (v: unknown): unknown =>
  typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v;

const plain = (v: any): any => {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = plain(v[k]);
    return out;
  }
  return num(v);
};

export interface PdfRecorder {
  /** Pass as `opts.pdfLib`, or assign to `globalThis.PDFLib` for the old code. */
  lib: any;
  /** Every call, in order: `["addPage", …]`, `["drawLine", …]`, and so on. */
  calls: any[];
}

/**
 * Separates the plain black lines from everything else.
 *
 * They are the one place the port deliberately left the old app behind: it
 * ruled cut lines right across the page, and this draws short crop marks at
 * the four outside corners instead. Everything else — the images, the clips,
 * the crosshairs, the pages — was recorded and still has to match, so the two
 * are kept apart. Crosshairs carry a blend mode; these do not.
 */
export function splitCutGuides(calls: any[]): {
  guides: any[];
  rest: any[];
} {
  const isGuide = (c: any) => c[0] === "drawLine" && c[2] && !c[2].blendMode;
  return {
    guides: calls.filter(isGuide),
    rest: calls.filter((c) => !isGuide(c)),
  };
}

export function recordingPdfLib(): PdfRecorder {
  const calls: any[] = [];
  const push = (op: string, ...args: unknown[]) => calls.push([op, ...args.map(plain)]);

  const makePage = (index: number) => ({
    drawLine: (o: any) => push("drawLine", index, o),
    drawImage: (img: any, o: any) => push("drawImage", index, img.ref, o),
    drawText: (text: string, o: any) => push("drawText", index, text, o),
    pushOperators: (...ops: any[]) => push("operators", index, ops),
  });

  let pageCount = 0;
  const doc = {
    setTitle: (t: string) => push("setTitle", t),
    setCreator: (c: string) => push("setCreator", c),
    addPage: (size: number[]) => {
      push("addPage", size);
      return makePage(pageCount++);
    },
    embedFont: async (name: string) => {
      push("embedFont", name);
      // Enough of a font for the alignment print, which only measures text to
      // centre its ruler labels.
      return { widthOfTextAtSize: (t: string, size: number) => t.length * size * 0.5 };
    },
    embedJpg: async (bytes: Uint8Array) => {
      const ref = digest(bytes);
      push("embedJpg", ref);
      return { ref };
    },
    save: async () => new Uint8Array([1, 2, 3]),
  };

  const lib = {
    PDFDocument: { create: async () => doc },
    rgb: (r: number, g: number, b: number) => ({ rgb: [r, g, b] }),
    BlendMode: { Difference: "Difference" },
    pushGraphicsState: () => ({ op: "q" }),
    popGraphicsState: () => ({ op: "Q" }),
    rectangle: (x: number, y: number, w: number, h: number) => ({
      op: "re",
      x,
      y,
      w,
      h,
    }),
    clip: () => ({ op: "W" }),
    endPath: () => ({ op: "n" }),
    StandardFonts: { Helvetica: "Helvetica" },
  };
  return { lib, calls };
}

/* ------------------------------------------------------------------ *
 * A recording canvas
 * ------------------------------------------------------------------ */

export interface CanvasRecord {
  width: number;
  height: number;
  ops: any[];
}

export interface CanvasRecorder {
  canvases: CanvasRecord[];
  /** Puts the stub `document`, `fetch` and `createImageBitmap` in place. */
  install(): void;
  restore(): void;
}

/*
 * A stand-in for TensorFlow.js and UpscalerJS.
 *
 * Both implementations load those from jsDelivr as UMD scripts and then read
 * them off the global object, so a stub that answers to the same handful of
 * calls is enough to run the enhance path outside a browser — which is the
 * only way to compare it, and the only way the doubled bleed of an upscaled
 * card gets checked at all.
 */
function installUpscaler(g: any): void {
  const tensor = (w: number, h: number): any => ({
    shape: [h, w],
    clipByValue: () => tensor(w, h),
    cast: () => tensor(w, h),
    dispose: () => {},
  });
  g.tf = {
    ready: async () => {},
    tidy: (fn: () => unknown) => fn(),
    browser: { toPixels: async () => {} },
  };
  g.Upscaler = class {
    async warmup() {}
    async upscale(input: { width: number; height: number }) {
      return tensor(input.width * 2, input.height * 2);
    }
  };
  g.ESRGANMedium2x = { model: "stub" };
}

/**
 * Deterministic pixels for `getImageData`, varying with position so each of
 * the four corners samples a different colour, and with some pixels below the
 * alpha cut-off so the "ignore the transparent ones" branch is exercised.
 */
function fakePixels(x: number, y: number, w: number, h: number): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const px = x + (i % w);
    const py = y + Math.floor(i / w);
    d[i * 4] = (px * 7) % 256;
    d[i * 4 + 1] = (py * 11) % 256;
    d[i * 4 + 2] = (px + py) % 256;
    d[i * 4 + 3] = i % 5 === 0 ? 100 : 255;
  }
  return d;
}

export function canvasRecorder(
  opts: { upscaler?: boolean } = {},
): CanvasRecorder {
  const canvases: CanvasRecord[] = [];
  const saved: Record<string, unknown> = {};

  const makeCanvas = (): any => {
    const rec: CanvasRecord = { width: 0, height: 0, ops: [] };
    canvases.push(rec);
    let gco = "source-over";
    const ctx = {
      get globalCompositeOperation() {
        return gco;
      },
      set globalCompositeOperation(v: string) {
        gco = v;
        rec.ops.push(["globalCompositeOperation", v]);
      },
      set imageSmoothingEnabled(v: boolean) {
        rec.ops.push(["imageSmoothingEnabled", v]);
      },
      set imageSmoothingQuality(v: string) {
        rec.ops.push(["imageSmoothingQuality", v]);
      },
      set fillStyle(v: string) {
        rec.ops.push(["fillStyle", v]);
      },
      fillRect: (...a: number[]) => rec.ops.push(["fillRect", ...a]),
      getImageData: (x: number, y: number, w: number, h: number) => {
        rec.ops.push(["getImageData", x, y, w, h]);
        return { data: fakePixels(x, y, w, h) };
      },
      /*
       * Normalised to the nine-argument form. The old code draws the card
       * itself with the short `drawImage(src, dx, dy)` form and the bleed
       * strips with the long one; the port uses the long form throughout. The
       * two are the same draw, so the short forms are expanded here rather
       * than counted as a difference.
       */
      drawImage: (src: any, ...a: number[]) => {
        const sw = src.width;
        const sh = src.height;
        const args =
          a.length === 8
            ? a
            : a.length === 4
              ? [0, 0, sw, sh, a[0], a[1], a[2], a[3]]
              : [0, 0, sw, sh, a[0], a[1], sw, sh];
        rec.ops.push(["drawImage", ...args]);
      },
    };
    const cv: any = {
      get width() {
        return rec.width;
      },
      set width(v: number) {
        rec.width = v;
      },
      get height() {
        return rec.height;
      },
      set height(v: number) {
        rec.height = v;
      },
      getContext: () => ctx,
      toBlob: (cb: (b: unknown) => void) =>
        cb({ arrayBuffer: async () => new Uint8Array([7, 7]).buffer }),
    };
    return cv;
  };

  const g = globalThis as any;
  return {
    canvases,
    install() {
      for (const k of [
        "document",
        "fetch",
        "createImageBitmap",
        "window",
        "tf",
        "Upscaler",
        "ESRGANMedium2x",
      ]) {
        saved[k] = g[k];
      }
      g.document = {
        createElement: (tag: string) =>
          tag === "canvas" ? makeCanvas() : { tag },
        /*
         * A script added to the head "loads" at once. The old code reads the
         * upscaler off `window`, the port off `window` too, so in Node the two
         * are pointed at the same object.
         */
        head: { appendChild: (el: any) => el.onload?.() },
      };
      if (opts.upscaler) {
        g.window = g;
        installUpscaler(g);
      }
      g.fetch = async () => ({ ok: true, blob: async () => ({}) });
      g.createImageBitmap = async () => ({
        width: 745,
        height: 1040,
        close: () => {},
      });
    },
    restore() {
      for (const k of Object.keys(saved)) g[k] = saved[k];
    },
  };
}
