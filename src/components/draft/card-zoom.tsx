"use client";

/* eslint-disable @next/next/no-img-element */

/*
 * A card at a size you can read it at.
 *
 * Still no Scryfall request: `artById` derives the CDN path from the id, so
 * the large scan is the same trick the thumbnails already use with a
 * different size in the path. Drafting at eight cards to a row means
 * deciding from the art alone — this is how you read the text.
 *
 * The overlay is handed the whole group it was opened from rather than one
 * card, because what people actually do is compare: reading a pack of fifteen
 * should not be fifteen rounds of open and close.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  ZoomInIcon,
} from "lucide-react";

import type { CardRef } from "@/lib/draft";
import { artById } from "@/lib/preview";
import { cn } from "@/lib/utils";

/** Which card is enlarged, and the group the arrows walk. */
export interface Zoom {
  cards: readonly CardRef[];
  at: number;
}

/** One step along the group, wrapping at either end. */
const step = (zoom: Zoom, by: number): Zoom => ({
  ...zoom,
  at: (zoom.at + by + zoom.cards.length) % zoom.cards.length,
});

/** Only worth saying when it is not the ordinary thing. */
const FINISH: Record<string, string> = { foil: "Foil", etched: "Etched foil" };

/**
 * The button that opens a zoom on a card that already does something else
 * when tapped.
 *
 * Small, in the corner, and always drawn: picking and sorting are the main
 * things and this must not get in their way, but it also cannot hide behind a
 * hover that a touchscreen does not have.
 */
export function ZoomPip({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Look at this card"
      onClick={onClick}
      className={cn(
        "absolute right-1 top-1 z-10 grid h-7 w-7 place-items-center rounded-full bg-background/85 text-foreground opacity-80 shadow-sm ring-1 ring-border backdrop-blur transition hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
    >
      <ZoomInIcon className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function CardZoom({
  zoom,
  onZoom,
}: {
  zoom: Zoom | null;
  onZoom: (zoom: Zoom | null) => void;
}) {
  const shut = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZoom(null);
      if (e.key === "ArrowLeft") onZoom(step(zoom, -1));
      if (e.key === "ArrowRight") onZoom(step(zoom, 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom, onZoom]);

  /* Both neighbours fetched up front, so stepping along a pack does not blink. */
  useEffect(() => {
    if (!zoom) return;
    for (const by of [-1, 1]) {
      const beside = step(zoom, by);
      const near = beside.cards[beside.at];
      if (near) new Image().src = artById(near.id, "large");
    }
  }, [zoom]);

  useEffect(() => {
    if (zoom) shut.current?.focus();
  }, [zoom]);

  /*
   * A refresh can take the card out from under an open zoom — a pack moves on
   * while you are reading it. Nothing to show is nothing to show.
   */
  const card = zoom?.cards[zoom.at];
  if (!zoom || !card) return null;

  const many = zoom.cards.length > 1;
  const finish = FINISH[card.finish];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Card"
      onClick={() => onZoom(null)}
      className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-neutral-950/85 p-4"
    >
      {/*
        * Two images, one on top of the other. The lower one is the same file
        * the grid behind this is already showing, so it is in the cache and
        * paints at once; the large scan lands on top of it a moment later.
        * Without it the first card opens as an empty frame while 700KB is
        * fetched.
        *
        * Keyed by the card, so stepping never leaves the card you were
        * looking at on screen under the caption for the next one.
        */}
      <div
        key={card.key}
        /* Clicking the card is not a way to lose it; the backdrop is. */
        onClick={(e) => e.stopPropagation()}
        className="relative min-w-0 cursor-default"
      >
        <img
          src={artById(card.id)}
          alt=""
          className="block max-h-[70vh] w-auto max-w-[92vw] rounded-[4.5%] shadow-2xl sm:max-h-[76vh] sm:max-w-[80vw]"
        />
        <img
          src={artById(card.id, "large")}
          alt=""
          className="absolute inset-0 block h-full w-full rounded-[4.5%]"
        />
      </div>

      {/*
        * Under the card rather than either side of it: a phone is narrow and
        * the card is the thing worth the width. On a keyboard the arrow keys
        * are quicker than either.
        */}
      {(many || finish) && (
        <div className="flex items-center gap-3 text-sm text-neutral-300">
          {many && (
            <Arrow
              label="Previous card"
              onClick={() => onZoom(step(zoom, -1))}
              icon={<ChevronLeftIcon className="h-6 w-6" aria-hidden />}
            />
          )}
          <p className="min-w-28 text-center">
            {many && (
              <span className="tabular-nums">
                {zoom.at + 1} of {zoom.cards.length}
              </span>
            )}
            {many && finish ? " · " : ""}
            {finish}
          </p>
          {many && (
            <Arrow
              label="Next card"
              onClick={() => onZoom(step(zoom, 1))}
              icon={<ChevronRightIcon className="h-6 w-6" aria-hidden />}
            />
          )}
        </div>
      )}

      <p className="text-center text-xs text-neutral-400">
        {many ? "Arrow keys step through them. " : ""}Tap the background or
        press Esc to close.
      </p>

      <button
        ref={shut}
        type="button"
        aria-label="Close"
        onClick={() => onZoom(null)}
        className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-neutral-900/80 text-neutral-200 ring-1 ring-neutral-700 transition hover:bg-neutral-800 hover:text-white"
      >
        <XIcon className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/** One of the two steppers, which must not take the backdrop's click. */
function Arrow({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-full bg-neutral-900/80 text-neutral-200 ring-1 ring-neutral-700 transition hover:bg-neutral-800 hover:text-white"
    >
      {icon}
    </button>
  );
}
