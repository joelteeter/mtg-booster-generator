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
import {
  backPageOffset,
  backPageRotation,
  rotationMatrix,
} from "@/lib/export/layout";
import { buildPdf } from "@/lib/export/pdf";
import { GRID, MM, PAPER } from "@/lib/export/paper";
import { offsetTag, runAlignmentPrint } from "@/lib/export/run";

import { fakeImageLoader, recordingPdfLib } from "./export-doubles";
import { DEFAULT_SETTINGS, exportPacks } from "./export-fixtures";

const images = (calls: any[]) => calls.filter((c) => c[0] === "drawImage");
const lines = (calls: any[]) => calls.filter((c) => c[0] === "drawLine");

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

  /*
   * That it is a translation and nothing else.
   *
   * The two tests above check each thing moved by the right amount; this
   * checks the page did not also turn or stretch while moving. Every vector
   * between two drawn things has to come through unchanged — which is what
   * rules out a rotation hiding inside the offset, since a rotation leaves
   * the things near the centre almost where they were and swings the rest.
   */
  it("keeps the page rigid: every distance and angle survives", async () => {
    const corners = (calls: any[]) =>
      images(calls).map((c) => ({ x: c[3].x, y: c[3].y }));
    const before = corners(await pdfWith(0, 0));
    const after = corners(await pdfWith(2, -3));
    expect(before.length).toBeGreaterThan(1);
    for (let i = 1; i < before.length; i++) {
      expect(after[i].x - after[0].x).toBeCloseTo(before[i].x - before[0].x, 5);
      expect(after[i].y - after[0].y).toBeCloseTo(before[i].y - before[0].y, 5);
    }
  });

  it("emits no transform of its own, however far it shifts", async () => {
    // A rotation shows up as a `cm` operator; an offset must never add one.
    const calls = await pdfWith(5, -5);
    expect(calls.filter((c) => c[0] === "operators" && JSON.stringify(c[2]).includes("cm"))).toHaveLength(0);
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

/*
 * Rotation, for the error an offset cannot reach: a sheet that lines up at
 * one end and is out at the other, because the two sides go through at
 * slightly different angles.
 */
describe("the duplex rotation", () => {
  const cm = (calls: any[]) =>
    calls
      .filter((c) => c[0] === "operators")
      .flatMap((c) => c[2])
      .filter((op: any) => op?.op === "cm");

  it("turns the page about its centre, leaving the centre alone", () => {
    const [cx, cy] = [PAPER.letter.w / 2, PAPER.letter.h / 2];
    const [a, b, c, d, e, f] = rotationMatrix(90, cx, cy);
    const at = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
    const [mx, my] = at(cx, cy);
    expect(mx).toBeCloseTo(cx, 6);
    expect(my).toBeCloseTo(cy, 6);
    // A quarter turn sends a point above the centre to its left.
    const [px, py] = at(cx, cy + 10);
    expect(px).toBeCloseTo(cx - 10, 6);
    expect(py).toBeCloseTo(cy, 6);
  });

  it("swings the bottom right and the top left when positive", () => {
    const [cx, cy] = [0, 0];
    const [a, b, c, d, e, f] = rotationMatrix(1, cx, cy);
    const at = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
    expect(at(0, -100)[0]).toBeGreaterThan(0); // below centre moves right
    expect(at(0, 100)[0]).toBeLessThan(0); // above centre moves left
  });

  /*
   * As with the offset, it is measured with the fronts toward you, where the
   * back shows through mirrored — and a mirror reverses which way a rotation
   * goes. Both flips are a single mirror, so both reverse it.
   */
  it("is reversed for the back page, whichever way the paper turns", () => {
    expect(backPageRotation(0.4)).toBe(-0.4);
    expect(backPageRotation(-0.4)).toBe(0.4);
    expect(Object.is(backPageRotation(0), 0)).toBe(true);
  });

  it("puts no transform on the page at all when it is zero", async () => {
    const rec = recordingPdfLib();
    await buildPdf(exportPacks().slice(0, 1), {
      side: "back",
      rotationDeg: 0,
      imageLoader: fakeImageLoader,
      pdfLib: rec.lib as never,
    });
    expect(cm(rec.calls)).toHaveLength(0);
  });

  it("puts one on each page when it is not", async () => {
    const rec = recordingPdfLib();
    await buildPdf(exportPacks(), {
      side: "back",
      rotationDeg: 0.4,
      newPagePerPack: true,
      imageLoader: fakeImageLoader,
      pdfLib: rec.lib as never,
    });
    const pages = rec.calls.filter((c) => c[0] === "addPage").length;
    expect(pages).toBeGreaterThan(1);
    expect(cm(rec.calls)).toHaveLength(pages);
  });
});

describe("the alignment test print", () => {
  const build = async (opts = {}) => {
    const rec = recordingPdfLib();
    await buildAlignmentPdf({ ...opts, pdfLib: rec.lib as never });
    return rec.calls;
  };
  const front = (opts = {}) => build({ ...opts, side: "front" });
  const back = (opts = {}) => build({ ...opts, side: "back" });

  /*
   * One side per file. A two-page PDF leaves the printer to decide how to
   * turn the paper over, which is the one thing the sheet exists to measure.
   */
  it("is a single page of the chosen paper, per side", async () => {
    for (const calls of [await front({ paper: "a4" }), await back({ paper: "a4" })]) {
      const pages = calls.filter((c) => c[0] === "addPage");
      expect(pages).toHaveLength(1);
      expect(pages[0][1]).toEqual([PAPER.a4.w, PAPER.a4.h]);
    }
  });

  /*
   * The front's crosses and the back's rulers have to meet, or there is
   * nothing to read. With no offset they sit at exactly the same places.
   */
  it("puts the back's rulers where the front's crosses are", async () => {
    const middle = (calls: any[]) => {
      const all = lines(calls);
      const xs = all.flatMap((c) => [c[2].start.x, c[2].end.x]);
      const ys = all.flatMap((c) => [c[2].start.y, c[2].end.y]);
      return [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
      ];
    };
    const [fx, fy] = middle(await front());
    const [bx, by] = middle(await back());
    expect(bx).toBeCloseTo(fx, 5);
    expect(by).toBeCloseTo(fy, 5);
  });

  it("offsets the back only, and turns it around to get there", async () => {
    const plainFront = lines(await front())[0][2];
    const shiftedFront = lines(await front({ offsetXMm: 2, offsetYMm: 2 }))[0][2];
    expect(shiftedFront.start.x).toBeCloseTo(plainFront.start.x, 5);
    expect(shiftedFront.start.y).toBeCloseTo(plainFront.start.y, 5);

    /*
     * "2 mm right" was measured with the fronts toward you, where the back
     * shows through mirrored, so on the back's own page it is 2 mm left.
     */
    const plainBack = lines(await back())[0][2];
    const shiftedBack = lines(
      await back({ offsetXMm: 2, offsetYMm: 2, flip: "long" }),
    )[0][2];
    expect(shiftedBack.start.x).toBeCloseTo(plainBack.start.x - 2 * MM, 5);
    expect(shiftedBack.start.y).toBeCloseTo(plainBack.start.y + 2 * MM, 5);
  });

  it("turns the other axis around on a short-edge flip", async () => {
    const plain = lines(await back())[0][2];
    const short = lines(
      await back({ offsetXMm: 2, offsetYMm: 2, flip: "short" }),
    )[0][2];
    expect(short.start.x).toBeCloseTo(plain.start.x + 2 * MM, 5);
    expect(short.start.y).toBeCloseTo(plain.start.y - 2 * MM, 5);
  });

  it("rules the back every millimetre, both ways, across the full reach", async () => {
    const drawn = lines(await back()).map((c) => c[2]);
    const spans = drawn.filter(
      (l: any) =>
        Math.abs(l.end.x - l.start.x) > RULER_MM * MM ||
        Math.abs(l.end.y - l.start.y) > RULER_MM * MM,
    );
    expect(spans.length).toBeGreaterThanOrEqual(GRID.cols * GRID.rows);
  });

  /*
   * Why the sheet needs no mirroring of its own: every cell carries the same
   * marks, so a uniform grid is its own mirror and a cell's rulers land
   * behind a cell's cross whichever way the printer turns the paper.
   */
  it("draws the same marks in all nine cells", async () => {
    const drawn = lines(await back()).map((c) => c[2]);
    const counts = new Map<string, number>();
    for (const l of drawn) {
      const shape = [
        Math.round((l.end.x - l.start.x) * 1000),
        Math.round((l.end.y - l.start.y) * 1000),
        l.thickness,
      ].join(",");
      counts.set(shape, (counts.get(shape) ?? 0) + 1);
    }
    expect([...counts.values()].filter((n) => n % 9 === 0).length).toBeGreaterThan(0);
  });

  it("says on each page what to do with it", async () => {
    const texts = (calls: any[]) =>
      calls.filter((c) => c[0] === "drawText").map((c) => c[2]);
    expect(texts(await front()).some((t: string) => /FRONT/.test(t))).toBe(true);
    // The sheet has to say which way round to hold it, or the sign is a coin
    // toss — which is how this was got wrong the first time.
    expect(
      texts(await front()).some((t: string) => /this side toward you/.test(t)),
    ).toBe(true);
    expect(texts(await back()).some((t: string) => /right \+, up \+/.test(t))).toBe(
      true,
    );
  });
});

describe("running the alignment print", () => {
  const settings = () => ({
    ...DEFAULT_SETTINGS,
    backOffsetXMm: 1.5,
    backOffsetYMm: -2,
    backRotationDeg: 0.4,
  });

  it("saves one file per side, each named for the offsets it was testing", async () => {
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
    const common = {
      paper: "a4",
      flip: "long",
      offsetXMm: 1.5,
      offsetYMm: -2,
      rotationDeg: 0.4,
    };
    expect(seen).toEqual([
      { side: "front", ...common },
      { side: "back", ...common },
    ]);
    // The offsets are on both files: a printed pair that cannot be matched to
    // the numbers it was testing is a sheet of wasted paper.
    // The rotation is in the name too when there is one, for the same reason
    // the offsets are: a printed pair has to be matchable to its numbers.
    expect(saved).toEqual([
      [3, "alignment-front-x+1.5-y-2-r+0.4.pdf", "application/pdf"],
      [3, "alignment-back-x+1.5-y-2-r+0.4.pdf", "application/pdf"],
    ]);
    expect(status[status.length - 1]).toMatch(/^✅/);
  });

  it("writes zero without a sign, and a positive one with it", () => {
    expect(offsetTag(0, 0)).toBe("x0-y0");
    expect(offsetTag(1, -0.5)).toBe("x+1-y-0.5");
    // No rotation, no mention of it: most sheets will not need one.
    expect(offsetTag(1, 0, 0)).toBe("x+1-y0");
    expect(offsetTag(1, 0, -0.35)).toBe("x+1-y0-r-0.35");
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
