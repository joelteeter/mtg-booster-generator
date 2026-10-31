/*
 * One download button, old against new.
 *
 * The maths is compared elsewhere; this compares the wiring, which is what
 * `js/downloads.js` was and what had no net at all: which packs an export
 * covers, every option handed to the exporter, every word of the status line
 * in order, the filename, and the MIME type.
 *
 * Both sides are given the same recording exporter, so the comparison is of
 * the request each implementation makes, not of the PDF that comes back.
 */
import { describe, expect, it, vi } from "vitest";

import {
  cardForComparison,
  enhanceCrop,
  runExport,
  type ExportKind,
  type ExportSettings,
} from "@/lib/export";
import type { PackEntry } from "@/lib/generate";

import { DEFAULT_SETTINGS, settingsCases } from "./export-fixtures";
import { runPorted } from "./generate-run";
import { SCENARIOS, normPacks } from "./generate-scenarios";
import { golden, readGolden } from "./goldens";
import { renderValue } from "./render";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Call {
  fn: "buildPdf" | "buildSaveFile";
  /** The cards handed over, by name — so the wrong row exporting shows up. */
  packs: string[][];
  opts: Record<string, unknown>;
}

/**
 * Stands in for the exporter. It records what it was asked for, reports a
 * little progress so the progress wording is compared too, and hands back
 * bytes of a fixed length.
 */
function recordingExporter(fail?: string) {
  const calls: Call[] = [];
  const plain = (opts: any): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(opts).sort()) {
      if (typeof opts[k] !== "function") out[k] = opts[k];
    }
    return out;
  };
  const bytes = new Uint8Array(3_145_728); // 3.0 MB, so the log line is checkable
  const cards = (packs: PackEntry[][]) =>
    packs.map((p) => p.map((e) => e.card.name));
  return {
    calls,
    exporter: {
      async buildPdf(packs: PackEntry[][], opts: any) {
        calls.push({ fn: "buildPdf", packs: cards(packs), opts: plain(opts) });
        if (fail) throw new Error(fail);
        opts.onProgress?.(0, 2);
        opts.onProgress?.(1, 2);
        opts.onProgress?.(2, 2);
        return bytes;
      },
      async buildSaveFile(packs: PackEntry[][], opts: any) {
        calls.push({
          fn: "buildSaveFile",
          packs: cards(packs),
          opts: plain(opts),
        });
        if (fail) throw new Error(fail);
        return bytes;
      },
    },
  };
}

const recorded = readGolden("generate");

/**
 * Two packs plus the token sheets, so the downloads table has several rows.
 *
 * The packs come from the port's own generator, checked against the ones the
 * old app drew for the same seed — so the exports below start from the same
 * cards the recorded exports did.
 */
async function packsFor(scenario: string, key: string) {
  const { result } = await runPorted(SCENARIOS[scenario]);
  expect(
    renderValue({
      packs: normPacks(result.packs),
      base: result.exportFiles.base,
    }),
  ).toBe(golden(recorded, key));
  return {
    packs: result.packs.map((p) => p.cards),
    base: result.exportFiles.base,
  };
}

const shared = packsFor("export-run", "export-run packs");
/*
 * A second run whose separator is a token rather than a land, so the card the
 * comparison view picks is decided by "not the separator" and not merely by
 * "not a land".
 */
const withTokenSeparator = packsFor(
  "export-run token",
  "export-run token packs",
);

const kinds: ExportKind[] = ["pdf", "back", "mpp"];

/** What one export produced, in the shape the old app's was recorded in. */
interface Outcome {
  calls: Call[];
  status: string[];
  saves: Array<{ filename: string; type: string; length: number }>;
}

async function portedExport(
  packs: PackEntry[][],
  base: string[],
  kind: ExportKind,
  idx: number,
  settings: ExportSettings,
  fail?: string,
): Promise<Outcome> {
  const rec = recordingExporter(fail);
  const status: string[] = [];
  const saves: Array<{ filename: string; type: string; bytes: Uint8Array }> =
    [];
  await runExport({
    kind,
    idx,
    packs,
    base,
    settings,
    exporter: rec.exporter,
    onStatus: (m) => status.push(m),
    save: (bytes, filename, type) => saves.push({ filename, type, bytes }),
    log: () => {},
  });
  return {
    calls: rec.calls,
    status,
    saves: saves.map((s) => ({
      filename: s.filename,
      type: s.type,
      length: s.bytes.length,
    })),
  };
}

describe("one download button, old against new", () => {
  for (const { name, settings } of settingsCases) {
    for (const kind of kinds) {
      for (const idx of [0, 1, 3]) {
        it(`${kind}, row ${idx}, ${name}`, async () => {
          const { packs, base } = await shared;
          const mine = await portedExport(packs, base, kind, idx, settings);
          expect(renderValue(mine)).toBe(
            golden(recorded, `export ${kind} ${idx} ${name}`),
          );
        });
      }
    }
  }

  it("reports a failed export the same way", async () => {
    const { packs, base } = await shared;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const kind of kinds) {
        const mine = await portedExport(
          packs,
          base,
          kind,
          0,
          DEFAULT_SETTINGS,
          "the network went away",
        );
        expect(renderValue(mine)).toBe(golden(recorded, `export fail ${kind}`));
        expect(mine.status.at(-1)).toBe(
          "❌ Export failed: the network went away",
        );
        expect(mine.saves).toEqual([]);
      }
    } finally {
      errors.mockRestore();
    }
  });

  it("covers one pack for a pack row and everything for row 0", async () => {
    const { packs, base } = await shared;
    const mine = await portedExport(packs, base, "mpp", 0, DEFAULT_SETTINGS);
    expect(mine.calls[0].packs).toHaveLength(packs.length);
    const one = await portedExport(packs, base, "mpp", 2, DEFAULT_SETTINGS);
    expect(one.calls[0].packs).toEqual([
      packs[1].map((e) => e.card.name),
    ]);
  });

  for (const [what, run] of [
    ["a land separator", shared],
    ["a token separator", withTokenSeparator],
  ] as const) {
    it(`picks the same card to compare the AI upscaler on, with ${what}`, async () => {
      const { packs } = await run;
      for (const idx of [0, 1, 2, 3]) {
        const entry = cardForComparison(packs, idx);
        expect(renderValue(entry ? entry.card.name : null)).toBe(
          golden(
            recorded,
            what === "a token separator"
              ? `compare token card ${idx}`
              : `compare card ${idx}`,
          ),
        );
      }
      // The separator must not be a land, or this proves nothing.
      if (what === "a token separator") {
        const sep = packs[0].find((e) => e.bonus);
        expect(sep).toBeDefined();
        expect(/Land/.test(sep!.card.type_line || "")).toBe(false);
      }
    });
  }

  it("falls back to the first pack when no pack is selected", async () => {
    const { packs } = await shared;
    const entry = cardForComparison(packs, NaN);
    expect(renderValue(entry ? entry.card.name : null)).toBe(
      golden(recorded, "compare card none"),
    );
  });

  /*
   * Both halves of that choice matter, but only one of them can be reached
   * through a generated pack: a pack always has a non-land card before its
   * separator, so "not the separator" never decides anything there. It is
   * still what the old code asked for, so it is pinned directly.
   */
  it("never compares on the separator, even when the pack is all lands", () => {
    const basic = {
      card: { id: "x", name: "Forest", type_line: "Basic Land — Forest" },
      finish: "nonfoil",
      slot: 1,
      label: "land",
    } as unknown as PackEntry;
    const separator = {
      card: { id: "y", name: "Goblin", type_line: "Token Creature — Goblin" },
      finish: "nonfoil",
      slot: null,
      label: "token separator",
      bonus: true,
      tokenSlot: true,
    } as unknown as PackEntry;
    expect(cardForComparison([[basic, separator]], 0)).toBe(basic);
  });

  it("crops the rules-text box for the comparison view", () => {
    /*
     * The old app computed this inline, in `showEnhanceComparison`: 5% in from
     * the left, 58% down, 62% wide and 20% tall of a 1490×2080 upscaled card.
     */
    expect(enhanceCrop(1490, 2080)).toEqual({ x: 75, y: 1206, w: 924, h: 416 });
  });

  it("logs how long the PDF took and how big it is", async () => {
    const { packs, base } = await shared;
    const rec = recordingExporter();
    const lines: string[] = [];
    let clock = 1000;
    await runExport({
      kind: "pdf",
      idx: 0,
      packs,
      base,
      settings: DEFAULT_SETTINGS,
      exporter: rec.exporter,
      onStatus: () => {},
      save: () => {},
      now: () => (clock += 2500),
      log: (m) => lines.push(m),
    });
    expect(lines).toEqual(["PDF built in 2.5s, 3.0 MB"]);
  });
});
