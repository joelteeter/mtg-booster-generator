/*
 * Loading a plain browser script at runtime, once.
 *
 * Two of the export dependencies are not bundled. sql.js is an Emscripten
 * build that reaches for Node's `fs` when a bundler looks at it, and it loads
 * its own `.wasm` beside itself; the AI upscaler and TensorFlow.js are tens of
 * megabytes that nobody who leaves the box unticked should pay for. Both are
 * therefore loaded the way the old app loaded them — as scripts that hang
 * themselves on `window` — the difference being that sql.js now comes from
 * this site rather than from a CDN.
 */
const scriptPromises: Record<string, Promise<void>> = {};

/** Loads a script once, and lets a failed load be retried. */
export function loadScript(src: string): Promise<void> {
  if (!scriptPromises[src]) {
    scriptPromises[src] = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        delete scriptPromises[src];
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromises[src];
}

/** A file served next to the page, so a deploy under a sub-path still finds it. */
export const ownUrl = (file: string): string =>
  new URL(file, document.baseURI).href;
