/*
 * Running one export: which packs, which options, what the status line says,
 * and what the file is called.
 *
 * This is the body of `exportFile` in `js/downloads.js`, with the three things
 * it reached into the DOM for turned into arguments: the settings, where the
 * status goes, and how a file is saved. That is what lets the whole chain be
 * compared against the old handler — the options object handed to the
 * exporter, every status message in order, and the filename and MIME type —
 * rather than only the maths underneath it.
 *
 * The React hook on top of this does nothing but supply the arguments.
 */
import type { PackEntry } from "@/lib/generate";

import {
  buildAlignmentPdf as defaultBuildAlignmentPdf,
  type AlignmentPdfOptions,
} from "./alignment";
import { buildPdf as defaultBuildPdf, type PdfOptions } from "./pdf";
import {
  buildSaveFile as defaultBuildSaveFile,
  type SaveFileOptions,
} from "./save-file";
import { backPageOffset, backPageRotation } from "./layout";
import type { DfcMode, Flip, PaperName, Quality } from "./index";

export type ExportKind = "pdf" | "back" | "mpp";

const KIND_LABEL: Record<ExportKind, string> = {
  pdf: "Fronts PDF",
  back: "Backs PDF",
  mpp: "MTGProxyPrinter file",
};

/** The print settings, shared by every tab as they were in the old UI. */
export interface ExportSettings {
  paper: PaperName;
  bleedMm: number;
  quality: Quality;
  dfcMode: DfcMode;
  flip: Flip;
  backImage: "standard" | "custom";
  /** A local object URL for the user's own image; never uploaded anywhere. */
  customBackUrl: string | null;
  newPagePerPack: boolean;
  enhance: boolean;
  /**
   * Duplex registration, in millimetres, applied to the backs sheet only.
   *
   * The fronts are the reference — they carry the cut guides you cut to — so
   * it is the backs that move to meet them.
   *
   * Measured, and therefore written, as you see it holding the printed sheet
   * to a light with the fronts toward you: + right and + up. `backPageOffset`
   * turns that into what the backs page needs.
   */
  backOffsetXMm: number;
  backOffsetYMm: number;
  /**
   * Duplex rotation, in degrees, applied to the backs sheet only.
   *
   * What an offset cannot fix: a sheet square at one end and out at the
   * other, because the two sides go through at slightly different angles.
   * Positive swings the bottom of the backs to the right, as you see it with
   * the fronts toward you.
   */
  backRotationDeg: number;
}

export interface Exporter {
  buildPdf(packs: PackEntry[][], opts: PdfOptions): Promise<Uint8Array>;
  buildAlignmentPdf?(opts: AlignmentPdfOptions): Promise<Uint8Array>;
  buildSaveFile(
    packs: PackEntry[][],
    opts: SaveFileOptions,
  ): Promise<Uint8Array>;
}

export interface RunExportParams {
  kind: ExportKind;
  /** 0 is every pack in one file; n is pack n. */
  idx: number;
  packs: PackEntry[][];
  /** Filename stems, as `ExportFiles.base`. */
  base: string[];
  settings: ExportSettings;
  onStatus: (message: string) => void;
  save: (bytes: Uint8Array, filename: string, type: string) => void;
  exporter?: Exporter;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * What one export covers, for the status line.
 *
 * Row 0 counts the token sheets as packs here, while the table's own label for
 * that row spells them out separately ("All 3 packs + 2 token sheets"). That
 * is how the old app worded it, and a sheet really is another page of cards in
 * the file, so it is left alone.
 */
export const exportTarget = (idx: number, packCount: number): string =>
  idx === 0 ? `all ${packCount} packs` : `pack ${idx}`;

export async function runExport({
  kind,
  idx,
  packs: all,
  base,
  settings,
  onStatus,
  save,
  exporter,
  now = Date.now,
  log = console.log,
}: RunExportParams): Promise<void> {
  const buildPdf = exporter?.buildPdf ?? defaultBuildPdf;
  const buildSaveFile = exporter?.buildSaveFile ?? defaultBuildSaveFile;
  const packs = idx === 0 ? all : [all[idx - 1]];
  const what = exportTarget(idx, packs.length);
  const { newPagePerPack, dfcMode } = settings;
  try {
    if (kind === "mpp") {
      onStatus(`⏳ Building MTGProxyPrinter file for ${what}…`);
      const bytes = await buildSaveFile(packs, { newPagePerPack, dfcMode });
      save(bytes, base[idx] + ".mtgproxies", "application/vnd.sqlite3");
    } else {
      const side = kind === "back" ? "back" : "front";
      const custom = settings.backImage === "custom";
      if (side === "back" && custom && !settings.customBackUrl) {
        throw new Error("Choose your card back image first.");
      }
      const t0 = now();
      const bytes = await buildPdf(packs, {
        side,
        dfcMode,
        flip: settings.flip,
        customBackUrl:
          side === "back" && custom ? settings.customBackUrl : null,
        paper: settings.paper,
        bleedMm: settings.bleedMm,
        ...(side === "back"
          ? (({ x, y }) => ({
              offsetXMm: x,
              offsetYMm: y,
              rotationDeg: backPageRotation(settings.backRotationDeg),
            }))(
              backPageOffset(
                settings.flip,
                settings.backOffsetXMm,
                settings.backOffsetYMm,
              ),
            )
          : { offsetXMm: 0, offsetYMm: 0, rotationDeg: 0 }),
        quality: settings.quality,
        // pdf.ts skips plain card backs; only card faces are upscaled.
        enhance: settings.enhance,
        newPagePerPack,
        title: base[idx] + (side === "back" ? " (backs)" : ""),
        onProgress: (done, total) =>
          onStatus(
            `⏳ ${side === "back" ? "Backs" : "Fronts"} PDF for ${what}: ` +
              `${settings.enhance ? "AI-enhancing" : "preparing"} card images ` +
              `${done} of ${total}…`,
          ),
      });
      onStatus(`⏳ Saving PDF…`);
      save(
        bytes,
        base[idx] + (side === "back" ? "-backs" : "") + ".pdf",
        "application/pdf",
      );
      log(
        `PDF built in ${((now() - t0) / 1000).toFixed(1)}s, ` +
          `${(bytes.length / 1048576).toFixed(1)} MB`,
      );
    }
    onStatus(`✅ ${KIND_LABEL[kind]} for ${what} downloaded.`);
  } catch (e) {
    console.error(e);
    onStatus(`❌ Export failed: ${(e as Error).message}`);
  }
}

/**
 * The card the "Compare on one card" view uses: one with rules text, so the
 * difference is visible — not a land and not the separator.
 */
export function cardForComparison(
  packs: PackEntry[][],
  index: number,
): PackEntry | undefined {
  const pack = packs[Number.isFinite(index) ? index : 0] || packs[0] || [];
  return (
    pack.find((e) => !e.bonus && !/Land/.test(e.card.type_line || "")) ||
    pack[0]
  );
}

/*
 * The two lines the comparison view writes. They were inline in
 * `showEnhanceComparison`; they are here so the hook that calls them stays a
 * wiring layer with no prose of its own.
 */
export const enhancingMessage = (name: string): string =>
  `⏳ AI-enhancing "${name}"… (the first run also downloads and prepares the upscaler)`;

export const enhancedMessage = (name: string, ms: number): string =>
  `✅ AI-enhanced "${name}" in ${(ms / 1000).toFixed(1)} s.`;

/**
 * The alignment test print: two pages, printed double-sided, measured by eye.
 *
 * Its own runner rather than another `ExportKind`, because it is not an
 * export of anything — it takes no packs, and it is as useful before a run as
 * after one.
 */
/**
 * How an offset reads in a filename: `x+1.5`, `x-2`, `x0`.
 *
 * On both files, not just the back, so a printed pair cannot be separated
 * from the numbers it was testing — which is the whole use of keeping them.
 */
export const offsetTag = (
  xMm: number,
  yMm: number,
  rotationDeg = 0,
): string => {
  const one = (v: number) => (v > 0 ? `+${v}` : String(v));
  return (
    `x${one(xMm)}-y${one(yMm)}` +
    (rotationDeg ? `-r${one(rotationDeg)}` : "")
  );
};

export async function runAlignmentPrint({
  settings,
  onStatus,
  save,
  exporter,
}: {
  settings: ExportSettings;
  onStatus: (message: string) => void;
  save: (bytes: Uint8Array, filename: string, type: string) => void;
  exporter?: Exporter;
}): Promise<void> {
  const build = exporter?.buildAlignmentPdf ?? defaultBuildAlignmentPdf;
  try {
    onStatus("⏳ Building the alignment test print…");
    const tag = offsetTag(
      settings.backOffsetXMm,
      settings.backOffsetYMm,
      settings.backRotationDeg,
    );
    for (const side of ["front", "back"] as const) {
      const bytes = await build({
        side,
        paper: settings.paper,
        flip: settings.flip,
        offsetXMm: settings.backOffsetXMm,
        offsetYMm: settings.backOffsetYMm,
        rotationDeg: settings.backRotationDeg,
      });
      save(bytes, `alignment-${side}-${tag}.pdf`, "application/pdf");
    }
    onStatus(
      `✅ Alignment test print downloaded: alignment-front-${tag}.pdf and ` +
        `alignment-back-${tag}.pdf. Print the front, turn the paper over the ` +
        "way your printer does, print the back, then hold the sheet to a " +
        "light with the fronts toward you.",
    );
  } catch (e) {
    console.error(e);
    onStatus(`❌ Alignment test print failed: ${(e as Error).message}`);
  }
}
