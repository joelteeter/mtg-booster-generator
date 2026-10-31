"use client";

/*
 * The Planechase and Archenemy simulators.
 *
 * One component for both: the two differ only in their configuration (the
 * search, the noun, the draw button, the blurb, whether the card is printed
 * sideways) and in the two features that belong to one of them — the planar
 * die, and ongoing schemes. That is how `js/simulators.js` was arranged too,
 * with one set of controls in `#simUI` and separate decks behind it.
 *
 * The deck state is in `store/sims.ts` so it survives switching tabs, which
 * the old closure did by accident and is worth keeping on purpose. The rules
 * and every string the user reads are in `lib/simulators.ts`.
 *
 * `<img>` rather than `next/image`: these are remote Scryfall CDN images in a
 * statically exported app, where the optimiser does not run at all.
 */
/* eslint-disable @next/next/no-img-element */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { queries } from "@/hooks/use-scryfall";
import {
  DIE,
  SIMS,
  cardNote,
  derivedStatus,
  emptyBoardText,
  imageOf,
  loadErrorText,
  loadingText,
  nextCostText,
  rollDie,
  rotateLabel,
  type DieFace,
  type SimKind,
} from "@/lib/simulators";
import type { Card } from "@/lib/scryfall/types";
import { cn } from "@/lib/utils";
import { useSimsStore } from "@/store/sims";

const ROLL_TICKS = 8;
const ROLL_TICK_MS = 70;

function DieBox({
  face,
  rolling,
  rolls,
}: {
  face: DieFace | null;
  rolling: boolean;
  rolls: number;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3.5 text-center">
      <div
        className={cn(
          "mx-auto mb-2 mt-1 grid size-24 place-items-center rounded-2xl bg-neutral-800 text-4xl text-white shadow-[inset_0_-6px_0_rgb(0_0_0/35%)]",
          rolling && "animate-pulse",
        )}
      >
        {face ? face.icon : "🎲"}
      </div>
      <div className="font-semibold">
        {rolling ? "Rolling…" : face ? face.label : "Planar die"}
      </div>
      {!rolling && face && (
        <div className="mt-1 text-xs text-muted-foreground">{face.note}</div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">
        {rolling ? "" : nextCostText(rolls)}
      </div>
    </div>
  );
}

function CardFrame({
  card,
  landscape,
  onZoom,
}: {
  card: Card;
  landscape: boolean;
  onZoom?: () => void;
}) {
  const url = imageOf(card, "large");
  return landscape ? (
    <div className="sim-frame-landscape w-full max-w-[680px] shadow-lg" onClick={onZoom}>
      <img src={url} alt={card.name} />
    </div>
  ) : (
    <div
      className="w-full max-w-[420px] overflow-hidden rounded-[4.75%/3.5%] bg-neutral-800 shadow-lg"
      onClick={onZoom}
    >
      <img src={url} alt={card.name} className="block aspect-[488/680] w-full" />
    </div>
  );
}

/*
 * The enlarged card. Whether it is rotated follows the simulator it was opened
 * from, not the card itself — exactly as the old code did, which is why a
 * scheme is never rotated and a plane follows the "show as scanned" toggle.
 */
function Zoom({ landscape }: { landscape: boolean }) {
  const card = useSimsStore((s) => s.zoom);
  const setZoom = useSimsStore((s) => s.setZoom);
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [card, setZoom]);
  if (!card) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-neutral-950/85 p-4"
      onClick={() => setZoom(null)}
    >
      <div className="max-w-full text-center text-white">
        <img
          src={imageOf(card, "large")}
          alt={card.name}
          className={cn(
            "rounded-2xl shadow-2xl",
            landscape ? "sim-zoom-landscape" : "max-h-[82vh] max-w-[92vw]",
          )}
        />
        <div className="mt-2.5 font-semibold">
          {card.name}
          {card.type_line ? ` — ${card.type_line}` : ""}
        </div>
        <div className="text-sm text-neutral-400">
          Click anywhere or press Esc to close
        </div>
      </div>
    </div>
  );
}

export function Simulator({ kind }: { kind: SimKind }) {
  const cfg = SIMS[kind];
  const { data: pool, error } = useQuery(queries.search(cfg.query, "cards"));

  const state = useSimsStore((s) => s.byKind[kind]);
  const message = useSimsStore((s) => s.message[kind]);
  const includePhenomena = useSimsStore((s) => s.includePhenomena);
  const shuffle = useSimsStore((s) => s.shuffle);
  const draw = useSimsStore((s) => s.draw);
  const abandon = useSimsStore((s) => s.abandon);
  const startTurn = useSimsStore((s) => s.startTurn);
  const setDie = useSimsStore((s) => s.setDie);
  const setRotated = useSimsStore((s) => s.setRotated);
  const setIncludePhenomena = useSimsStore((s) => s.setIncludePhenomena);
  const setZoom = useSimsStore((s) => s.setZoom);

  const [rollingFace, setRollingFace] = useState<DieFace | null>(null);
  const rolling = rollingFace !== null;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const roll = () => {
    if (rolling) return;
    let ticks = 0;
    setRollingFace(DIE[Math.floor(Math.random() * 6)]);
    timer.current = setInterval(() => {
      if (++ticks >= ROLL_TICKS) {
        if (timer.current) clearInterval(timer.current);
        setRollingFace(null);
        setDie(rollDie());
        return;
      }
      setRollingFace(DIE[Math.floor(Math.random() * 6)]);
    }, ROLL_TICK_MS);
  };

  const status =
    message ??
    (pool
      ? derivedStatus(state, kind, pool.length)
      : error
        ? loadErrorText((error as Error).message)
        : loadingText(kind));

  const planar = kind === "planechase";
  const landscape = cfg.landscape && !state.rotated;
  const note = state.current ? cardNote(state.current, kind) : "";
  const past = state.history.slice(1, 13);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{cfg.blurb}</p>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!pool} onClick={() => pool && shuffle(kind, pool)}>
          🔀 Shuffle
        </Button>
        <Button
          disabled={!pool || (!state.deck.length && !state.current)}
          onClick={() => draw(kind)}
        >
          {cfg.drawLabel}
        </Button>
        {planar && (
          <>
            <Button disabled={!state.current || rolling} onClick={roll}>
              🎲 Roll planar die
            </Button>
            <Button variant="secondary" onClick={startTurn}>
              New turn
            </Button>
          </>
        )}
      </div>

      {planar && (
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="simPhenomena"
            checked={includePhenomena}
            onCheckedChange={(v) => setIncludePhenomena(v === true)}
          />
          <Label htmlFor="simPhenomena" className="font-normal">
            Include phenomena (re-shuffle to apply)
          </Label>
        </div>
      )}

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {status}
      </p>

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-[260px] flex-[1_1_420px]">
          {state.current ? (
            <div className="flex flex-col gap-2">
              <CardFrame card={state.current} landscape={landscape} />
              <div className="font-semibold">
                {state.current.name}{" "}
                <span className="font-normal text-muted-foreground">
                  {state.current.type_line || ""} ·{" "}
                  {(state.current.set || "").toUpperCase()}
                </span>
              </div>
              {note && (
                <div className="rounded-md bg-amber-100 px-2.5 py-1.5 text-sm text-amber-900">
                  {note}
                </div>
              )}
              {cfg.landscape && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => setRotated(kind, !state.rotated)}
                >
                  {rotateLabel(state.rotated)}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed px-5 py-16 text-center text-muted-foreground">
              {emptyBoardText(state, kind)}
            </div>
          )}
        </div>

        <div className="flex min-w-[220px] flex-col gap-3">
          {planar && (
            <DieBox
              face={rollingFace ?? state.die}
              rolling={rolling}
              rolls={state.rolls}
            />
          )}
          {!planar && (
            <div className="text-sm">
              <strong>Ongoing schemes ({state.ongoing.length})</strong>
              {state.ongoing.length ? (
                state.ongoing.map((c, i) => (
                  <div key={i} className="mt-2 flex items-center gap-2">
                    <img
                      src={imageOf(c, "small")}
                      alt={`Enlarge ${c.name}`}
                      title="Click to enlarge"
                      loading="lazy"
                      className="w-14 cursor-zoom-in rounded"
                      onClick={() => setZoom(c)}
                    />
                    <span
                      className="cursor-zoom-in hover:text-primary"
                      onClick={() => setZoom(c)}
                    >
                      {c.name}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => abandon(i)}
                    >
                      Abandon
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">None in play.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {past.length > 0 && (
        <div className="border-t pt-2.5">
          <strong className="text-sm">Previously revealed</strong>
          <div className="flex gap-2 overflow-x-auto pb-1.5">
            {past.map((c, i) => (
              <div
                key={i}
                title="Click to enlarge"
                className="w-24 flex-none cursor-zoom-in text-center text-[0.68rem] text-muted-foreground"
                onClick={() => setZoom(c)}
              >
                <img
                  src={imageOf(c, "small")}
                  alt={`Enlarge ${c.name}`}
                  loading="lazy"
                  className="block w-full rounded"
                />
                {c.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <Zoom landscape={landscape} />
    </div>
  );
}
