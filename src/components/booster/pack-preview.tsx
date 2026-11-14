"use client";

/*
 * Pack preview: the cards of one pack at a time.
 *
 * The images come from links already in the Scryfall card data, so previewing
 * costs no API requests — only the pack being looked at is loaded, lazily.
 * Ported from `js/preview.js`; the flip mechanics are in globals.css.
 *
 * `<img>` rather than `next/image`: these are remote Scryfall CDN images in a
 * statically exported app, where the optimiser does not run at all.
 */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { previewOptionLabel, type PackEntry } from "@/lib/generate";
import { cardSides } from "@/lib/preview";
import { cn } from "@/lib/utils";
import { usePacksStore } from "@/store/packs";

function PreviewCard({ entry }: { entry: PackEntry }) {
  const [face, setFace] = useState(0);
  const sides = cardSides(entry);
  const two = sides.length > 1;
  const finish = entry.finish !== "nonfoil" ? entry.finish : "";
  const badge =
    entry.finish === "foil" ? "FOIL" : entry.finish === "etched" ? "ETCHED" : "";
  const flip = () => two && setFace((f) => (f + 1) % 2);
  const other = sides[(face + 1) % 2];

  return (
    <figure
      className={cn(
        "m-0 text-xs leading-snug text-muted-foreground",
        entry.bonus && "pv-separator",
      )}
    >
      <div
        className={cn(
          "pv-stage group",
          two && "pv-flippable",
          face === 1 && "pv-flipped",
        )}
        onClick={flip}
      >
        <div className="pv-flipper">
          <div className={cn("pv-face", finish)}>
            {sides[0] && (
              <img
                src={sides[0].url}
                alt={sides[0].name}
                loading="lazy"
                decoding="async"
              />
            )}
            {badge && (
              <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-px text-[0.65rem] font-bold text-white">
                {badge}
              </span>
            )}
          </div>
          {two && (
            <div className={cn("pv-face pv-back", finish)}>
              <img
                src={sides[1].url}
                alt={sides[1].name}
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
        </div>
        {two && (
          <button
            type="button"
            aria-label="Flip to the other side of this card"
            title={`${other.name} is on the other side — click to flip`}
            onClick={(e) => {
              e.stopPropagation();
              flip();
            }}
            className="absolute left-1.5 top-1.5 z-2 grid size-[26px] place-items-center rounded-full border border-white/40 bg-black/60 text-white opacity-0 transition-[transform,opacity] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ⟲
          </button>
        )}
      </div>
      <figcaption className="mt-1.5">
        <b className="text-foreground">
          {entry.slot ? `Slot ${entry.slot}` : "Separator"}
        </b>{" "}
        · {entry.label}
        <br />
        <span>{sides[face]?.name ?? entry.card.name}</span>
        {two && <span className="opacity-70"> · {face === 1 ? "back" : "front"}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * The preview itself: a page at a time, with its own chooser.
 *
 * Presentational, so that the booster page and the lands and tokens pages can
 * all use it. Which page is open lives with the caller, because the booster
 * page keeps it in a store — the "Compare on one card" button reads it to
 * decide which card to compare — while the sheets pages only need it while
 * they are on screen.
 */
export function PreviewDeck({
  pages,
  open,
  index,
  onToggle,
  onShow,
  labelFor,
  showLabel,
  hideLabel,
}: {
  pages: PackEntry[][];
  open: boolean;
  index: number;
  onToggle: () => void;
  onShow: (index: number) => void;
  labelFor: (page: PackEntry[], index: number) => string;
  showLabel: string;
  hideLabel: string;
}) {
  if (!pages.length) return null;
  const shown = Math.min(index, pages.length - 1);
  const page = pages[shown];

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <Button variant="secondary" className="self-start" onClick={onToggle}>
        {open ? hideLabel : showLabel}
      </Button>
      {open && (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              aria-label="Previous page"
              disabled={shown === 0}
              onClick={() => onShow(shown - 1)}
            >
              ◀
            </Button>
            <Select
              value={String(shown)}
              onValueChange={(v) => onShow(Number(v))}
            >
              <SelectTrigger aria-label="Page to preview" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pages.map((p, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {labelFor(p, i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              aria-label="Next page"
              disabled={shown === pages.length - 1}
              onClick={() => onShow(shown + 1)}
            >
              ▶
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Images load from Scryfall&apos;s image server (cards.scryfall.io),
            one page at a time; no extra API requests. Cards with two sides —
            double-faced cards, and the token separators and token sheets that
            carry a different token on each side — show a ⟲ button; click the
            card to flip it.
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {page.map((e, i) => (
              <PreviewCard key={`${shown}-${i}`} entry={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PackPreview() {
  const packs = usePacksStore((s) => s.packs);
  const open = usePacksStore((s) => s.previewOpen);
  const index = usePacksStore((s) => s.previewIndex);
  const toggle = usePacksStore((s) => s.togglePreview);
  const showPack = usePacksStore((s) => s.showPack);

  return (
    <PreviewDeck
      pages={packs.map((p) => p.cards)}
      open={open}
      index={index}
      onToggle={toggle}
      onShow={showPack}
      labelFor={(_cards, i) => previewOptionLabel(packs[i], i)}
      showLabel="👁 Preview packs"
      hideLabel="🙈 Hide preview"
    />
  );
}
