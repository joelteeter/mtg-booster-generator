"use client";

/* eslint-disable @next/next/no-img-element */

/*
 * Building forty cards out of what you drafted.
 *
 * Still no Scryfall: the images come from ids as they do while drafting, and
 * you sort by looking at the cards. Names and mana costs would make this a
 * better builder, and they cost a request per seventy-five cards — worth it
 * when the decklist has to be written out for printing, which is the next
 * phase, and not worth it to move a picture from one pile to another.
 *
 * Legality is `checkDeck`, the same function the handler calls before it
 * accepts anything. This page is showing its answer early, not forming its
 * own opinion, so the two cannot drift.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { BASICS, checkDeck, emptyDeck, problemText } from "@/lib/draft";
import type { BasicLand, CardRef, Deck } from "@/lib/draft";
import { artById } from "@/lib/preview";
import type { RoomView } from "@/lib/room";
import { DraftError, saveDeck, unlockDeck } from "@/lib/room-client";
import { cn } from "@/lib/utils";

import { PoolNote } from "./pool-note";

import { DeckPrints } from "./deck-prints";

type Zone = "main" | "side" | "out";

/** One tap moves a card on: into the deck, across to the side, then out. */
const NEXT: Record<Zone, Zone> = { out: "main", main: "side", side: "out" };

const WHERE: Record<Zone, { title: string; hint: string }> = {
  main: { title: "The deck", hint: "Tap a card to move it to the sideboard." },
  side: { title: "Sideboard", hint: "Tap a card to take it out." },
  out: { title: "Not playing", hint: "Tap a card to put it in the deck." },
};

export function DeckBuilder({
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
  const pool = useMemo(() => view.you?.drafted ?? [], [view.you]);
  /*
   * Seeded once from what the server last held. A refetch does not reach in
   * and rearrange the piles somebody is in the middle of moving — the cost
   * being that a deck saved on another device needs a reload to appear.
   */
  const [deck, setDeck] = useState<Deck>(() => view.deck ?? emptyDeck());
  const [busy, setBusy] = useState(false);

  const zoneOf = useMemo(() => {
    const at = new Map<string, Zone>();
    for (const key of deck.main) at.set(key, "main");
    for (const key of deck.side) at.set(key, "side");
    return (key: string): Zone => at.get(key) ?? "out";
  }, [deck]);

  const piles = useMemo(() => {
    const out: Record<Zone, CardRef[]> = { main: [], side: [], out: [] };
    for (const card of pool) out[zoneOf(card.key)].push(card);
    return out;
  }, [pool, zoneOf]);

  const check = useMemo(
    () => checkDeck(deck, pool.map((c) => c.key)),
    [deck, pool],
  );

  const move = (key: string) => {
    const to = NEXT[zoneOf(key)];
    setDeck((was) => ({
      ...was,
      main: to === "main" ? [...was.main, key] : was.main.filter((k) => k !== key),
      side: to === "side" ? [...was.side, key] : was.side.filter((k) => k !== key),
    }));
  };

  const setBasic = (name: BasicLand, count: number) =>
    setDeck((was) => ({
      ...was,
      basics: { ...was.basics, [name]: Math.max(0, count) },
    }));

  const save = async (submit: boolean) => {
    if (!seatKey) return;
    setBusy(true);
    try {
      await saveDeck(view.code, seatKey, deck, submit);
      toast.success(
        submit ? "Handed in. That is your deck." : "Saved. Come back to it.",
      );
      onRefresh();
    } catch (e) {
      const refused = e instanceof DraftError ? e : null;
      toast.error(
        refused?.reason === "bad-deck"
          ? "That deck will not do."
          : "Could not save the deck.",
        { description: refused?.detail ?? (e as Error)?.message },
      );
    } finally {
      setBusy(false);
    }
  };

  const handBack = async (id: string, name: string) => {
    if (!adminKey) return;
    setBusy(true);
    try {
      await unlockDeck(view.code, adminKey, id);
      toast.success(`${name} can change their deck again.`);
      onRefresh();
    } catch {
      toast.error("Could not hand that deck back.");
    } finally {
      setBusy(false);
    }
  };

  const done = view.roster.filter((p) => p.submitted).length;

  return (
    <>
      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Build your deck</h2>
          <p className="text-sm text-muted-foreground">
            {done} of {view.roster.length} handed in
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Forty cards, basic lands counted in and added for free, plus up to
          five beside it. Save as often as you like; hand it in when it is
          done.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Checking…" : "Refresh"}
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </section>

      <PoolNote summary={view.summary} />

      {!view.you && (
        <p className="text-sm text-muted-foreground">
          You are watching this one. Decks are only ever shown to whoever built
          them.
        </p>
      )}

      {view.you && (
        <>
          <section className="rounded-lg border p-4">
            <h2 className="mb-2 font-semibold">Basic lands</h2>
            <ul className="flex flex-wrap gap-3">
              {BASICS.map((name) => {
                const count = deck.basics[name] ?? 0;
                return (
                  <li key={name} className="flex items-center gap-1.5">
                    <span className="w-16 text-sm">{name}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`One fewer ${name}`}
                      onClick={() => setBasic(name, count - 1)}
                      disabled={count === 0}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center tabular-nums">
                      {count}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`One more ${name}`}
                      onClick={() => setBasic(name, count + 1)}
                    >
                      +
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>

          {(["main", "side", "out"] as Zone[]).map((zone) => (
            <section key={zone} className="rounded-lg border p-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">
                  {WHERE[zone].title}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {zone === "main"
                      ? `${check.cards} cards + ${check.basics} lands = ${check.total}`
                      : `${piles[zone].length}`}
                    {zone === "side" && " of 5"}
                  </span>
                </h2>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {WHERE[zone].hint}
              </p>
              {piles[zone].length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here.</p>
              ) : (
                <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                  {piles[zone].map((card) => (
                    <li key={card.key}>
                      <button
                        type="button"
                        onClick={() => move(card.key)}
                        className={cn(
                          "block w-full overflow-hidden rounded-[4.5%] transition hover:opacity-100",
                          zone === "out" ? "opacity-60" : "opacity-100",
                        )}
                      >
                        <img
                          src={artById(card.id)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="block w-full"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="rounded-lg border p-4">
            <h2 className="mb-2 font-semibold">
              {view.submitted ? "Handed in" : "Hand it in"}
            </h2>
            {check.ok ? (
              <p className="mb-3 text-sm text-muted-foreground">
                {check.total} cards and a sideboard of {check.side}. That is a
                legal deck.
              </p>
            ) : (
              <ul className="mb-3 list-inside list-disc text-sm text-destructive">
                {/*
                  * De-duplicated: twenty cards you did not draft is one
                  * problem to read, not twenty lines of the same sentence.
                  */}
                {[...new Set(check.problems.map(problemText))].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            )}
            {view.submitted && (
              <p className="mb-3 text-sm text-muted-foreground">
                This is the deck that will be printed. Changing it takes it
                back off the pile until you hand it in again.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => save(false)}
                disabled={busy}
              >
                Save for later
              </Button>
              <Button onClick={() => save(true)} disabled={busy || !check.ok}>
                {view.submitted ? "Hand it in again" : "Hand it in"}
              </Button>
            </div>
          </section>
        </>
      )}

      {/*
        * `view.admin` rather than the key in this browser: the server says
        * whether that key is still the admin's, and a stale one left over
        * from a deleted draft should not put buttons on the page that cannot
        * work. The key itself is still what makes the call.
        */}
      {view.admin && adminKey && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">Decks handed in</h2>
          <ul className="flex flex-col gap-1.5">
            {view.roster.map((p) => (
              <li
                key={p.name}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="w-32">{p.name}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-xs",
                    p.submitted
                      ? "bg-muted"
                      : "text-muted-foreground opacity-70",
                  )}
                >
                  {p.submitted ? "done" : "still building"}
                </span>
                {p.submitted && p.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => handBack(p.id as string, p.name)}
                  >
                    Hand it back
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.admin && adminKey && (
        <DeckPrints view={view} adminKey={adminKey} />
      )}
    </>
  );
}
