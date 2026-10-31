/*
 * Optional 2× AI upscaling of card faces, on the graphics card.
 *
 * UpscalerJS and TensorFlow.js are tens of megabytes between them, and nobody
 * who does not tick the box should pay for them, so they stay where the old
 * app had them: UMD scripts fetched from jsDelivr the first time the option is
 * used, never part of this app's bundle. A dynamic `import()` of npm copies
 * would also work, but it would pull TensorFlow through the bundler for a
 * feature most runs never touch.
 *
 * Measured on a Mac (Apple GPU, Chrome, one 745×1040 card): about 10–11 s per
 * card with 128 px tiles on WebGL. WebGPU was no faster, 256 px tiles were
 * much slower (~25 s), and the lighter esrgan-slim model was ~6 s but softer —
 * so medium, WebGL and 128 px tiles are what the old app settled on and what
 * this keeps.
 */

import { loadScript } from "./load-script";

const CDN = {
  /** TensorFlow.js 4.11 is the version UpscalerJS 1.0 targets. */
  tfjs: "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js",
  upscaler:
    "https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js",
  /** ESRGAN "medium" 2× model, ~2.7 MB, fetched by the library itself. */
  esrgan2x:
    "https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-medium@1.0.0/dist/umd/models/esrgan-medium/src/x2/index.min.js",
} as const;

const UPSCALE = { patchSize: 128, padding: 8 } as const;

/* The shapes the three UMD scripts hang on `window`. */
interface Tensor {
  shape: number[];
  clipByValue(min: number, max: number): Tensor;
  cast(dtype: string): Tensor;
  dispose(): void;
}
interface Tf {
  ready(): Promise<void>;
  tidy<T>(fn: () => T): T;
  browser: { toPixels(t: Tensor, canvas: HTMLCanvasElement): Promise<void> };
}
interface UpscalerInstance {
  warmup(sizes: Array<{ patchSize: number; padding: number }>): Promise<void>;
  upscale(
    input: HTMLCanvasElement,
    opts: { output: "tensor"; patchSize: number; padding: number },
  ): Promise<Tensor>;
}
interface UpscalerGlobals {
  tf?: Tf;
  Upscaler?: new (opts: { model: unknown }) => UpscalerInstance;
  ESRGANMedium2x?: unknown;
}

const globals = (): UpscalerGlobals => window as unknown as UpscalerGlobals;

let upscalerPromise: Promise<UpscalerInstance> | null = null;

function getUpscaler(): Promise<UpscalerInstance> {
  if (!upscalerPromise) {
    upscalerPromise = (async () => {
      await loadScript(CDN.tfjs);
      await loadScript(CDN.upscaler);
      await loadScript(CDN.esrgan2x);
      const g = globals();
      if (!g.tf || !g.Upscaler) throw new Error("the upscaler did not load");
      await g.tf.ready();
      const up = new g.Upscaler({ model: g.ESRGANMedium2x });
      await up.warmup([UPSCALE]); // compiles the model for this GPU once
      return up;
    })().catch((e: Error) => {
      upscalerPromise = null;
      throw new Error("Couldn't start the AI upscaler: " + e.message);
    });
  }
  return upscalerPromise;
}

/*
 * One image at a time: the GPU does the work, so running several at once only
 * adds memory.
 */
let upscaleQueue: Promise<unknown> = Promise.resolve();

export function upscaleCanvas(
  canvas: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const job = upscaleQueue.then(async () => {
    const up = await getUpscaler();
    const tf = globals().tf!;
    const out = await up.upscale(canvas, { output: "tensor", ...UPSCALE });
    const pixels = tf.tidy(() => out.clipByValue(0, 255).cast("int32"));
    out.dispose();
    const result = document.createElement("canvas");
    result.width = pixels.shape[1];
    result.height = pixels.shape[0];
    await tf.browser.toPixels(pixels, result);
    pixels.dispose();
    return result;
  });
  upscaleQueue = job.catch(() => {});
  return job;
}
