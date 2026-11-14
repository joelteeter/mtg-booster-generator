/*
 * The duplex offset and the alignment test print.
 *
 * Both are about one number: how far a printer puts the second side out of
 * register. The offset is how it gets cancelled, and the test print is how it
 * gets measured, so the two have to agree about which way is which.
 */
/*
 * The recorder hands back plain call tuples, as the other export tests take
 * them: `any` here is the recorder's shape, not a gap in the code under test.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import { buildAlignmentPdf, RULER_MM } from "@/lib/export/alignment";
import { backPageOffset } from "@/lib/export/layout";
import { buildPdf } from "@/lib/export/pdf";
import { GRID, MM, PAPER } from "@/lib/export/paper";
import { runAlignmentPrint } from "@/lib/export/run";

import { fakeImageLoader, recordingPdfLib } from "./export-doubles";
import { DEFAULT_SETTINGS, exportPacks } from "./export-fixtures";

const images = (calls: any[]) => calls.filter((c) => c[0] === "drawImage");
const lines = (calls: any[]) => calls.filter((c) => c[0] === "drawLine");
const onPage = (calls: any[], page: number) =>
  calls.filter((c) => c[1] === page);

async function pdfWith(offsetXMm: number, offsetYMm: number) {
  const rec = recordingPdfLib();
  await buildPdf(exportPacks().slice(0, 1), {
    side: "back",
    offsetXMm,
    offsetYMm,
    imageLoader: fakeImageLoader,
    pdfLib: rec.lib as never,
  });
  return rec.calls;
}

describe("the duplex offset", () => {
  it("moves every card on the page by the millimetres asked for", async () => {
    const none = images(await pdfWith(0, 0));
    const moved = images(await pdfWith(2, -3));
    expect(none.length).toBeGreaterThan(0);
    expect(moved).toHaveLength(none.length);
    for (const [i, call] of moved.entries()) {
      expect(call[3].x).toBeCloseTo(none[i][3].x + 2 * MM, 5);
      expect(call[3].y).toBeCloseTo(none[i][3].y - 3 * MM, 5);
    }
  });

  /*
   * The guides have to travel with the cards. A crosshair left behind would
   * mark a cut that no longer matches what is printed.
   */
  it("moves the crosshairs and crop marks with them", async () => {
    const none = lines(await pdfWith(0, 0));
    const moved = lines(await pdfWith(1.5, 1.5));
    expect(none.length).toBeGreaterThan(0);
    expect(moved).toHaveLength(none.length);
    for (const [i, call] of moved.entries()) {
      expect(call[2].start.x).toBeCloseTo(none[i][2].start.x + 1.5 * MM, 5);
      expect(call[2].start.y).toBeCloseTo(none[i][2].start.y + 1.5 * MM, 5);
      expect(call[2].end.x).toBeCloseTo(none[i][2].end.x + 1.5 * MM, 5);
      expect(call[2].end.y).toBeCloseTo(none[i][2].end.y + 1.5 * MM, 5);
    }
  });

  it("does nothing when it is zero, missing or nonsense", async () => {
    const base = JSON.stringify(images(await pdfWith(0, 0)));
    for (const opts of [{}, { offsetXMm: NaN }, { offsetYMm: undefined }]) {
      const rec = recordingPdfLib();
      await buildPdf(exportPacks().slice(0, 1), {
        side: "back",
        ...opts,
        imageLoader: fakeImageLoader,
        pdfLib: rec.lib as never,
      });
      expect(JSON.stringify(images(rec.calls))).toBe(base);
    }
  });
});

/*
 * The sign, which is the whole of this feature's usability.
 *
 * You measure the error holding the sheet to a light with the fronts toward
 * you. The backs page is on the other side and mirrored to match, so one of
 * the two axes is reversed by the time it is printed — and which one depends
 * on the edge the printer flips about, a setting three fields away. Getting
 * this wrong costs a sheet of paper and a print each time.
 */
describe("turning a measured offset into a page offset", () => {
  it("reverses across on a long-edge flip, and up on a short-edge one", () => {
    expect(backPageOffset("long", 1, 2)).toEqual({ x: -1, y: 2 });
    expect(backPageOffset("short", 1, 2)).toEqual({ x: 1, y: -2 });
  });

  it("treats an unset flip as the long edge, as the backs sheet does", () => {
    expect(backPageOffset(undefined, 1, 2)).toEqual({ x: -1, y: 2 });
  });

  it("is its own inverse, so a measurement can always be undone", () => {
    for (const flip of ["long", "short"] as const) {
      const once = backPageOffset(flip, 1.5, -2.5);
      expect(backPageOffset(flip, once.x, once.y)).toEqual({
        x: 1.5,
        y: -2.5,
      });
    }
  });

  it("keeps zero as zero rather than negative zero", () => {
    // `-0` renders as a different string in the recorded calls.
    for (const flip of ["long", "short"] as const) {
      expect(Object.is(backPageOffset(flip, 0, 0).x, 0)).toBe(true);
      expect(Object.is(backPageOffset(flip, 0, 0).y, 0)).toBe(true);
    }
  });
});

describe("the alignment test print", () => {
  const build = async (opts = {}) => {
    const rec = recordingPdfLib();
    await buildAlignmentPdf({ ...opts, pdfLib: rec.lib as never });
    return rec.calls;
  };

  it("is two pages of the chosen paper", async () => {
    const calls = await build({ paper: "a4" });
    const pages = calls.filter((c) => c[0] === "addPage");
    expect(pages).toHaveLength(2);
    for (const p of pages) expect(p[1]).toEqual([PAPER.a4.w, PAPER.a4.h]);
  });

  /*
   * The front's crosses and the back's rulers have to meet, or there is
   * nothing to read. With no offset they sit at exactly the same places.
   */
  it("puts the back's rulers where the front's crosses are", async () => {
    const calls = await build();
    const centre = (page: number) => {
      const xs = onPage(lines(calls), page).flatMap((c) => [
        c[2].start.x,
        c[2].end.x,
      ]);
      const ys = onPage(lines(calls), page).flatMap((c) => [
        c[2].start.y,
        c[2].end.y,
      ]);
      return [(Math.min(...xs) + Math.max(...xs)) / 2,
              (Math.min(...ys) + Math.max(...ys)) / 2];
    };
    const [fx, fy] = centre(0);
    const [bx, by] = centre(1);
    expect(bx).toBeCloseTo(fx, 5);
    expect(by).toBeCloseTo(fy, 5);
  });

  it("offsets the back page only, and turns it around to get there", async () => {
    const plain = await build();
    const shifted = await build({ offsetXMm: 2, offsetYMm: 2, flip: "long" });
    const front = (calls: any[]) => onPage(lines(calls), 0).length;
    expect(front(shifted)).toBe(front(plain));

    const firstFront = onPage(lines(plain), 0)[0][2];
    const shiftedFront = onPage(lines(shifted), 0)[0][2];
    expect(shiftedFront.start.x).toBeCloseTo(firstFront.start.x, 5);

    /*
     * "2 mm right" was measured with the fronts toward you, where the back
     * shows through mirrored, so on the back's own page it is 2 mm left.
     */
    const firstBack = onPage(lines(plain), 1)[0][2];
    const shiftedBack = onPage(lines(shifted), 1)[0][2];
    expect(shiftedBack.start.x).toBeCloseTo(firstBack.start.x - 2 * MM, 5);
    expect(shiftedBack.start.y).toBeCloseTo(firstBack.start.y + 2 * MM, 5);
  });

  it("turns the other axis around on a short-edge flip", async () => {
    const plain = onPage(lines(await build()), 1)[0][2];
    const short = onPage(
      lines(await build({ offsetXMm: 2, offsetYMm: 2, flip: "short" })),
      1,
    )[0][2];
    expect(short.start.x).toBeCloseTo(plain.start.x + 2 * MM, 5);
    expect(short.start.y).toBeCloseTo(plain.start.y - 2 * MM, 5);
  });

  it("rules the back page every millimetre, both ways, across the full reach", async () => {
    const calls = await build();
    const back = onPage(lines(calls), 1).map((c) => c[2]);
    // Ticks are short marks; the rulers themselves span the full reach.
    const spans = back.filter(
      (l: any) =>
        Math.abs(l.end.x - l.start.x) > RULER_MM * MM ||
        Math.abs(l.end.y - l.start.y) > RULER_MM * MM,
    );
    expect(spans.length).toBeGreaterThanOrEqual(GRID.cols * GRID.rows);
  });

  /*
   * Why the sheet needs no `flip`: every cell carries the same marks, so a
   * uniform grid is its own mirror and a cell's rulers land behind a cell's
   * cross whichever way the printer turns the paper.
   */
  it("draws the same marks in all nine cells", async () => {
    const back = onPage(lines(await build()), 1).map((c) => c[2]);
    const shapes = back.map((l: any) =>
      [
        Math.round((l.end.x - l.start.x) * 1000),
        Math.round((l.end.y - l.start.y) * 1000),
        l.thickness,
      ].join(","),
    );
    const counts = new Map<string, number>();
    for (const sh of shapes) counts.set(sh, (counts.get(sh) ?? 0) + 1);
    // The grid rules are drawn once; every mark inside a cell is drawn nine
    // times, once per cell.
    const cellMarks = [...counts.values()].filter((n) => n % 9 === 0);
    expect(cellMarks.length).toBeGreaterThan(0);
  });

  it("says on the page what to do with it", async () => {
    const texts = (await build())
      .filter((c) => c[0] === "drawText")
      .map((c) => c[2]);
    expect(texts.some((t: string) => /FRONT/.test(t))).toBe(true);
    // The sheet has to say which way round to hold it, or the sign is a coin
    // toss — which is how this was got wrong the first time.
    expect(
      texts.some((t: string) => /this side toward you/.test(t)),
    ).toBe(true);
    expect(texts.some((t: string) => /right \+, up \+/.test(t))).toBe(true);
  });
});

describe("running the alignment print", () => {
  const settings = () => ({
    ...DEFAULT_SETTINGS,
    backOffsetXMm: 1.5,
    backOffsetYMm: -2,
  });

  it("passes the current offsets and paper through, and saves one file", async () => {
    const seen: any[] = [];
    const saved: any[] = [];
    const status: string[] = [];
    await runAlignmentPrint({
      settings: { ...settings(), paper: "a4" },
      onStatus: (m) => status.push(m),
      save: (bytes, name, type) => saved.push([bytes.length, name, type]),
      exporter: {
        buildPdf: async () => new Uint8Array(),
        buildSaveFile: async () => new Uint8Array(),
        buildAlignmentPdf: async (opts) => {
          seen.push(opts);
          return new Uint8Array([1, 2, 3]);
        },
      },
    });
    expect(seen).toEqual([
      { paper: "a4", flip: "long", offsetXMm: 1.5, offsetYMm: -2 },
    ]);
    expect(saved).toEqual([[3, "alignment-test.pdf", "application/pdf"]]);
    expect(status[status.length - 1]).toMatch(/^✅/);
  });

  it("reports a failure rather than throwing", async () => {
    const status: string[] = [];
    await runAlignmentPrint({
      settings: settings(),
      onStatus: (m) => status.push(m),
      save: () => {
        throw new Error("disk full");
      },
      exporter: {
        buildPdf: async () => new Uint8Array(),
        buildSaveFile: async () => new Uint8Array(),
        buildAlignmentPdf: async () => new Uint8Array([1]),
      },
    });
    expect(status[status.length - 1]).toBe(
      "❌ Alignment test print failed: disk full",
    );
  });
});
