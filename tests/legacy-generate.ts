/*
 * The old app's Generate button, run in Node.
 *
 * This is the third and last of the parity tricks, and the most complete: six
 * of the old scripts are concatenated and run as one VM script, exactly as the
 * browser would run them, with a stub DOM underneath and a fake Scryfall
 * behind `fetch`. Then the click handler is called.
 *
 * Concatenating them is what makes it work: the old files share one top-level
 * lexical scope in the browser (that is how `ui.js` can use `esc` from nowhere
 * in particular), and no two of them declare the same name, so one script
 * reproduces that scope faithfully. An expression appended to the end can then
 * see every `const` and `let` in it, which is how `lastPacks` — a `let` in
 * `preview.js` that `generate.js` reassigns — is read back out.
 *
 * `js/export.js` and `js/booster-logic.js` are plain `require`s: both export
 * for CommonJS, so the real `isDfc` and the real spec builders are used rather
 * than copies.
 *
 * What is stubbed is only the DOM and the clock. Every decision in the chain —
 * pool loading, the `is:booster` filtering, the spec, the outcome draw, the
 * printing draw, the Guest List swap, God Packs, the separator, the token
 * sheets, the CSV rows, the filenames and the status line — is the old code's.
 *
 * Deleted with the old app in phase 6.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any */
const require_ = createRequire(import.meta.url);

/** Load order, as `index.html` lists them (minus the ones nothing here needs). */
const SOURCES = ["scryfall", "csv", "ui", "generate", "preview", "downloads"];

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../js/${name}.js`, import.meta.url)), "utf8");

/** One generated pack as the old code left it: an array with two properties. */
export type LegacyPack = any[] & { godPack?: boolean; tokenSheet?: number };

export interface LegacyRun {
  packs: LegacyPack[];
  exportFiles: { base: string[]; csv: string[] } | null;
  /** What `#status` ended up saying. */
  status: string;
  /** Every message `#status` passed through, in order. */
  statusHistory: string[];
  /** The downloads table's rows, as `downloads.js` rendered them. */
  dlRowsHtml: string;
  /** The preview's pack dropdown, as `generate.js` rendered it. */
  previewSelectHtml: string;
}

export interface LegacyGenerateOptions {
  fetch: typeof globalThis.fetch;
  /** Replaces `Math.random` inside the VM, so a run is reproducible. */
  random: () => number;
  mode: "play" | "commander";
  /**
   * Form control values by element id. A boolean sets `checked`, a string sets
   * `value`; anything not listed is an empty, unchecked control.
   */
  controls?: Record<string, string | boolean>;
}

/** One file `saveBytes` handed to the browser. */
export interface LegacySave {
  filename: string;
  type: string;
  bytes: unknown;
}

export interface LegacyApp {
  run(): Promise<LegacyRun>;
  /** Sets a form control after construction, between exports. */
  setControl(id: string, value: string | boolean): void;
  /** Replaces `window.Exporter`, so the calls into it can be recorded. */
  setExporter(exporter: unknown): void;
  /** Sets `downloads.js`'s `customBackUrl`, as choosing a file would. */
  setCustomBack(url: string | null): void;
  /** Runs one row's download button: `exportFile(kind, idx)`. */
  exportFile(kind: string, idx: number): Promise<void>;
  /** The card the "Compare on one card" view would use. */
  packForComparison(): unknown;
  /** Everything `#exportStatus` said, in order. */
  exportStatusHistory(): string[];
  /** Every file the run offered for download. */
  saves(): LegacySave[];
  /** The pure helpers from `csv.js` and `preview.js`, for direct comparison. */
  formatToFullCSV(card: any, finish?: any, section?: any): string;
  faceImages(card: any, size?: string): string[];
  cardSides(entry: any): Array<{ url: string; name: string }>;
  dfcCount(pack: any[]): number;
  /** The form readers from `ui.js`, so the ported options can be compared. */
  getOpts(): any;
  buildSpec(code: string, opts: any, stats: any): any[];
  currentCode(): string;
  currentLayout(): string | null;
  cmdAny(): boolean;
}

function makeElement(
  id: string,
  control: string | boolean | undefined,
  onClick: (el: any) => void = () => {},
) {
  const classes = new Set<string>();
  return {
    id,
    /* `saveBytes` builds an anchor, points it at a blob and clicks it. */
    href: "",
    download: "",
    click() {
      onClick(this);
    },
    remove: () => {},
    value: typeof control === "string" ? control : "",
    checked: control === true,
    textContent: "",
    innerHTML: "",
    disabled: false,
    files: [],
    style: {} as Record<string, string>,
    // `offsetParent` is how `rateLimitNotice` decides an element is visible.
    offsetParent: {},
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on?: boolean) => {
        const want = on ?? !classes.has(c);
        if (want) classes.add(c);
        else classes.delete(c);
        return want;
      },
    },
    querySelectorAll: () => [] as unknown[],
    closest: () => null,
    appendChild: () => {},
    addEventListener: () => {},
  };
}

export function loadLegacyApp(options: LegacyGenerateOptions): LegacyApp {
  const controls = options.controls ?? {};
  const elements = new Map<string, ReturnType<typeof makeElement>>();
  /* Both progress lines are recorded as they change, not just where they end. */
  const histories: Record<string, string[]> = { status: [], exportStatus: [] };
  const statusHistory = histories.status;
  const blobs = new Map<string, { parts: unknown[]; type: string }>();
  const saves: LegacySave[] = [];

  const onClick = (el: any) => {
    const blob = blobs.get(el.href);
    if (blob) {
      saves.push({
        filename: el.download,
        type: blob.type,
        bytes: blob.parts[0],
      });
    }
  };

  const getElementById = (id: string) => {
    if (!elements.has(id)) {
      const el = makeElement(id, controls[id], onClick);
      if (histories[id]) {
        let text = "";
        Object.defineProperty(el, "textContent", {
          get: () => text,
          set: (v: string) => {
            text = v;
            histories[id].push(v);
          },
        });
      }
      elements.set(id, el);
    }
    return elements.get(id)!;
  };

  /* The Generate handler, captured when `generate.js` registers it. */
  let clickHandler: (() => Promise<void>) | null = null;
  const genBtn = getElementById("genBtn");
  (genBtn as any).addEventListener = (ev: string, fn: () => Promise<void>) => {
    if (ev === "click") clickHandler = fn;
  };

  const sandbox: Record<string, unknown> = {
    // js/state.js, which the browser loads first.
    L: require_("../js/booster-logic.js"),
    $: getElementById,
    genBtn,
    status: getElementById("status"),
    downloadContainer: getElementById("downloadContainer"),
    setSelect: getElementById("setSelect"),
    cmdSetSelect: getElementById("cmdSetSelect"),
    mode: options.mode,
    setMeta: {},
    poolCache: {},
    loadedPools: {},
    modeState: {},

    document: {
      getElementById,
      querySelectorAll: () => [] as unknown[],
      createElement: () => makeElement("created", undefined, onClick),
      addEventListener: () => {},
      body: { appendChild: () => {} },
    },
    // `downloads.js` and `preview.js` reach for the exporter's `isDfc`.
    window: { Exporter: require_("../js/export.js") },
    URL: {
      createObjectURL: (b: { parts: unknown[]; type: string }) => {
        const url = `blob:${blobs.size}`;
        blobs.set(url, b);
        return url;
      },
      revokeObjectURL: () => {},
    },
    Blob: class {
      type: string;
      constructor(
        public parts: unknown[],
        opts?: { type?: string },
      ) {
        this.type = opts?.type ?? "";
      }
    },
    console: { warn: () => {}, error: () => {}, log: () => {} },
    fetch: options.fetch,
    // The 150 ms request queue would make every test wait for real.
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
    clearInterval: () => {},
    setInterval: () => 0,
    clearTimeout: () => {},
    // Seeded, so both implementations draw the same cards in the same order.
    Math: Object.assign(Object.create(Math), { random: options.random }),
  };

  /*
   * Appended to the same script, so it closes over the files' shared top-level
   * scope — the only way to read a `let` that one file declares and another
   * reassigns.
   */
  const collect = `;({
    getLastPacks: () => lastPacks,
    getLastExport: () => lastExport,
    formatToFullCSV, faceImages, cardSides, dfcCount,
    getOpts, buildSpec, currentCode, currentLayout, cmdAny,
    exportFile, packForComparison,
    setCustomBack: u => { customBackUrl = u; }
  })`;

  const api = vm.runInNewContext(
    SOURCES.map(read).join("\n") + collect,
    sandbox,
    { filename: "js/<old app>.js" },
  ) as any;

  return {
    formatToFullCSV: api.formatToFullCSV,
    faceImages: api.faceImages,
    cardSides: api.cardSides,
    dfcCount: api.dfcCount,
    getOpts: api.getOpts,
    buildSpec: api.buildSpec,
    currentCode: api.currentCode,
    currentLayout: api.currentLayout,
    cmdAny: api.cmdAny,
    setControl(id, value) {
      const el = getElementById(id) as any;
      if (typeof value === "boolean") el.checked = value;
      else el.value = value;
    },
    setExporter(exporter) {
      (sandbox.window as { Exporter: unknown }).Exporter = exporter;
    },
    setCustomBack: api.setCustomBack,
    exportFile: api.exportFile,
    packForComparison: api.packForComparison,
    exportStatusHistory: () => [...histories.exportStatus],
    saves: () => [...saves],
    async run(): Promise<LegacyRun> {
      if (!clickHandler)
        throw new Error("generate.js did not register a click handler");
      await clickHandler();
      return {
        packs: api.getLastPacks(),
        exportFiles: api.getLastExport(),
        status: getElementById("status").textContent,
        statusHistory: [...statusHistory],
        dlRowsHtml: getElementById("dlRows").innerHTML,
        previewSelectHtml: getElementById("previewPackSelect").innerHTML,
      };
    },
  };
}
