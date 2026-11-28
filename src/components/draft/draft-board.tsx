"use client";

/* eslint-disable @next/next/no-img-element */

/*
 * A draft in progress: the table, your queue, and what you have taken.
 *
 * Nothing here fetches a card. The view hands over a Scryfall id and
 * `faceImages` derives the CDN path from it, so a pack appears with no API
 * request at all — the image is the card, and the name on it is the name.
 * Phase 4 will need real card data for a decklist; picking does not.
 *
 * Packs pile up rather than waiting for each other, and a seat may pick from
 * any pack it holds. That is safe because with the seat order fixed at the
 * start, a pack's contents on any visit depend only on the seats that saw it
 * earlier — so whether somebody took two days changes when a card is taken
 * and nothing else. See docs/async-draft.md.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CardRef, PackView } from "@/lib/draft";
import { artById } from "@/lib/preview";
import { cn } from "@/lib/utils";

import { CardZoom, ZoomPip, type Zoom } from "./card-zoom";
import { PoolNote } from "./pool-note";
import { SeatKeys } from "./seat-keys";
import { WayBack } from "./way-back";
import type { RoomView } from "@/lib/room";
import { prettyCode } from "@/lib/room/codes";
import { DraftError, sendPick } from "@/lib/room-client";

/** Scryfall's image path is derived from the id, so this costs no request. */
const art = (ref: CardRef): string => artById(ref.id);

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function DraftBoard({
  view,
  seatKey,
  adminKey,
  onRefresh,
  onLeave,
  refreshing,
}: {
  view: RoomView;
  seatKey: string | null;
  adminKey: string | null;
  onRefresh: () => void;
  onLeave: () => void;
  refreshing: boolean;
}) {
  const [packId, setPackId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<Zoom | null>(null);

  const board = view.board;
  const you = view.you;
  const queue = you?.queue ?? [];
  const over = board?.over ?? false;

  const toggle = (pack: PackView, key: string) => {
    if (packId !== pack.id) {
      setPackId(pack.id);
      setChosen([key]);
      return;
    }
    setChosen((was) =>
      was.includes(key)
        ? was.filter((k) => k !== key)
        : was.length >= pack.take
          ? [...was.slice(1), key]
          : [...was, key],
    );
  };

  const take = async (pack: PackView) => {
    if (!seatKey || chosen.length !== pack.take) return;
    const cards = [...chosen];
    setBusy(true);
    try {
      try {
        await sendPick(view.code, seatKey, pack.id, cards);
      } catch (e) {
        /*
         * A lost race is not a rejected pick. The whole draft is one blob, so
         * two picks from two different packs still contend for the next
         * revision and one of them loses — but it is almost certainly still a
         * legal pick, so send it again rather than telling somebody their pack
         * moved on when it did not.
         */
        if (!(e instanceof DraftError) || e.reason !== "lost-race") throw e;
        await sendPick(view.code, seatKey, pack.id, cards);
      }
      setChosen([]);
      setPackId(null);
      onRefresh();
    } catch (e) {
      const why =
        e instanceof DraftError
          ? {
              "not-your-pack": "That pack has moved on to somebody else.",
              "wrong-count": `Take ${plural(pack.take, "card")}.`,
              "not-in-pack": "That card has already gone.",
              "draft-over": "The draft has finished.",
              "lost-race": "Two picks landed at once. Try that again.",
            }[e.reason]
          : undefined;
      toast.error(why ?? "The pick did not go through.");
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            {over
              ? "Drafting is finished"
              : `Pack ${board?.round ?? 1} of ${board?.rounds ?? 1}`}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">
            {prettyCode(view.code)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Checking…" : "Check for packs"}
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave
          </Button>
        </div>
        {!over && (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing updates on its own — come back whenever and press that.
          </p>
        )}
      </section>

      <PoolNote summary={view.summary} />

      <WayBack view={view} seatKey={seatKey} adminKey={adminKey} />

      {/*
        * The board had no admin area before this. It needs one: a link goes
        * missing mid-draft more often than in the lobby, and the admin should
        * not have to wait for the drafting to finish to fix it.
        */}
      {view.admin && adminKey && <SeatKeys view={view} adminKey={adminKey} onRefresh={onRefresh} />}

      {board && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">The table</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Seat</th>
                <th className="py-1 font-medium">Player</th>
                <th className="py-1 text-right font-medium">Drafted</th>
                <th className="py-1 text-right font-medium">Holding</th>
              </tr>
            </thead>
            <tbody>
              {board.seats.map((s) => {
                const waiting = board.waitingOn.indexOf(s.seat);
                return (
                  <tr key={s.seat} className="border-t">
                    <td className="py-1 tabular-nums">{s.seat + 1}</td>
                    <td className="py-1">
                      {s.name || <span className="opacity-50">empty</span>}
                      {s.seat === you?.seat && " "}
                      {s.seat === you?.seat && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          you
                        </span>
                      )}
                      {/*
                        * Longest wait first, so the top of that list is who
                        * everybody else is waiting on.
                        */}
                      {waiting === 0 && !over && " "}
                      {waiting === 0 && !over && (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-xs">
                          to pick
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {s.drafted}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {s.holding || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {!you && (
        <p className="text-sm text-muted-foreground">
          You are watching this one — the cards in each pack are only ever sent
          to whoever is holding it.
        </p>
      )}

      {you && !over && queue.length === 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-1 font-semibold">Nothing to pick</h2>
          <p className="text-sm text-muted-foreground">
            No pack has reached you yet. Everybody picks at their own pace, so
            this is normal — check back later.
          </p>
        </section>
      )}

      {you &&
        queue.map((pack, i) => (
          <section key={pack.id} className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {i === 0 ? "Your pick" : "Also waiting"}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {plural(pack.cards.length, "card")} left · take{" "}
                  {pack.take}
                </span>
              </h2>
              <Button
                onClick={() => take(pack)}
                disabled={busy || chosen.length !== pack.take || packId !== pack.id}
              >
                {busy ? "Taking…" : `Take ${plural(pack.take, "card")}`}
              </Button>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {pack.cards.map((ref, at) => {
                const picked = packId === pack.id && chosen.includes(ref.key);
                return (
                  <li key={ref.key} className="relative">
                    <ZoomPip
                      onClick={() => setZoom({ cards: pack.cards, at })}
                    />
                    <button
                      type="button"
                      onClick={() => toggle(pack, ref.key)}
                      aria-pressed={picked}
                      className={cn(
                        "block w-full overflow-hidden rounded-[4.5%] ring-offset-2 ring-offset-background transition",
                        picked
                          ? "ring-2 ring-primary"
                          : "opacity-90 hover:opacity-100",
                      )}
                    >
                      <img
                        src={art(ref)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="block w-full"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {you && you.drafted.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">
            Your cards ({you.drafted.length})
          </h2>
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
            {you.drafted.map((ref, at) => (
              <li key={ref.key}>
                {/* Nothing else to do with a card you have taken, so the
                    whole thing opens it. */}
                <button
                  type="button"
                  aria-label="Look at this card"
                  onClick={() => setZoom({ cards: you.drafted, at })}
                  className="block w-full cursor-zoom-in overflow-hidden rounded-[4.5%] transition hover:opacity-80"
                >
                  <img
                    src={art(ref)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="block w-full"
                  />
                </button>
              </li>
            ))}
          </ul>
          {over && (
            <p className="mt-3 text-sm text-muted-foreground">
              That is everything you drafted. Building a deck from it, and
              printing it, is the next thing to be built.
            </p>
          )}
        </section>
      )}

      <CardZoom zoom={zoom} onZoom={setZoom} />
    </>
  );
}
