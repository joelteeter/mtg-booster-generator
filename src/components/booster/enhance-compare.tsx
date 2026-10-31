"use client";

/*
 * The "Compare on one card" overlay: the same card plain-resized to 2× beside
 * the AI-upscaled version, cropped to the rules-text box at 1:1 pixels, which
 * is where the difference is actually visible.
 *
 * The two canvases come from the upscaler rather than from markup, so they are
 * cropped into fresh canvases and attached by ref. Closing is a click anywhere
 * or Escape, as before.
 */
import { useEffect, useRef } from "react";

import { enhanceCrop } from "@/lib/export";
import { useExportStore } from "@/store/export";

function CroppedCanvas({ source }: { source: HTMLCanvasElement }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const crop = enhanceCrop(source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = crop.w;
    canvas.height = crop.h;
    canvas.className = "h-auto max-w-[min(46vw,920px)] rounded bg-white";
    canvas
      .getContext("2d")
      ?.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    const node = holder.current;
    node?.replaceChildren(canvas);
    return () => node?.replaceChildren();
  }, [source]);

  return <div ref={holder} />;
}

export function EnhanceCompare() {
  const comparison = useExportStore((s) => s.comparison);
  const close = useExportStore((s) => s.showComparison);

  useEffect(() => {
    if (!comparison) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [comparison, close]);

  if (!comparison) return null;

  return (
    <div
      role="presentation"
      onClick={() => close(null)}
      className="fixed inset-0 z-50 box-border flex cursor-zoom-out items-center justify-center bg-[rgba(10,12,18,0.88)] p-4"
    >
      <div className="max-h-full max-w-full overflow-auto text-center text-white">
        <div className="mb-2.5 font-bold">
          {comparison.name}: rules text area at 600 dpi, 1:1 pixels
        </div>
        <div className="flex flex-wrap justify-center gap-3.5">
          <figure className="m-0">
            <figcaption className="mb-1 text-sm text-neutral-300">
              Plain 2× resize
            </figcaption>
            <CroppedCanvas source={comparison.plain} />
          </figure>
          <figure className="m-0">
            <figcaption className="mb-1 text-sm text-neutral-300">
              ✨ AI-enhanced 2×
            </figcaption>
            <CroppedCanvas source={comparison.enhanced} />
          </figure>
        </div>
        <div className="mt-2 text-neutral-400">Click anywhere to close</div>
      </div>
    </div>
  );
}
