"use client";

/*
 * A room before it is dealt: who is in it, and the one button that starts it.
 *
 * The packs come from the Boosters page rather than from a generator of this
 * page's own, and the admin generates them *after* seeing who turned up —
 * which is why the seat count is settled at the deal and `maxSeats` is only a
 * cap on joining. Six people arriving for an eight-seat pool was the obvious
 * way for this to go wrong, and generating last avoids it.
 */
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { poolFromRun } from "@/lib/draft-pool";
import type { RoomView } from "@/lib/room";
import { prettyCode } from "@/lib/room/codes";
import {
  DraftError,
  joinRoom,
  roomLink,
  startRoom,
} from "@/lib/room-client";
import { usePacksStore } from "@/store/packs";

import type { Entered } from "./draft-ui";

export function RoomLobby({
  view,
  seatKey,
  adminKey,
  onEnter,
  onRefresh,
  onLeave,
  refreshing,
}: {
  view: RoomView;
  seatKey: string | null;
  adminKey: string | null;
  onEnter: (code: string, keys: Entered) => void;
  onRefresh: () => void;
  onLeave: () => void;
  refreshing: boolean;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const packs = usePacksStore((s) => s.packs);

  const pool = poolFromRun(packs);
  const needed = view.roster.length * view.rounds;
  const full = view.roster.length >= view.maxSeats;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        roomLink(window.location.origin, view.code),
      );
      toast.success("Link copied. Send it to the others.");
    } catch {
      toast.error("Could not copy — the code is on screen to read out.");
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const joined = await joinRoom(view.code, name);
      onEnter(view.code, { seat: joined.playerKey });
      toast.success(`You are in, ${joined.name}.`);
    } catch (e) {
      const why =
        e instanceof DraftError
          ? {
              "name-taken": "Somebody in this draft already has that name.",
              "room-full": "This draft is full.",
              "bad-name": "That name will not do.",
              "wrong-phase": "This draft has already started.",
            }[e.reason]
          : undefined;
      toast.error(why ?? "Could not join.");
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const deal = async () => {
    if (!adminKey) return;
    setBusy(true);
    try {
      await startRoom(view.code, adminKey, pool.slice(0, needed));
      toast.success("Dealt. Everybody has a pack.");
      onRefresh();
    } catch (e) {
      toast.error(
        e instanceof DraftError && e.reason === "bad-pool"
          ? "Those packs do not fit the table."
          : "Could not deal.",
        { description: e instanceof Error ? e.message : undefined },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Waiting to start</h2>
            <p className="text-sm text-muted-foreground">
              Give people this code, or the link.
            </p>
          </div>
          <p className="font-mono text-3xl font-bold tracking-widest">
            {prettyCode(view.code)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={copy}>
            Copy the link
          </Button>
          <Button variant="ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Checking…" : "Who is here?"}
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">
          In the room ({view.roster.length} of {view.maxSeats})
        </h2>
        {view.roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {view.roster.map((p) => (
              <li
                key={p.name}
                className="rounded-md border px-2.5 py-1 text-sm"
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
        {/*
          * Seats are dealt at random when the draft starts, so the order here
          * is arrival order and means nothing about where anybody will sit.
          */}
        <p className="mt-2 text-xs text-muted-foreground">
          Seats are drawn at random when the draft starts.
        </p>
      </section>

      {!seatKey && !full && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-1 font-semibold">Take a seat</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            A name is all it takes. This browser remembers your seat, and the
            link you are given will get you back to it on another one.
          </p>
          <form onSubmit={join} className="flex flex-wrap items-end gap-2">
            <div className="grow basis-48">
              <Label htmlFor="draft-name">Your name</Label>
              <Input
                id="draft-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Joining…" : "Join"}
            </Button>
          </form>
        </section>
      )}

      {!seatKey && full && !adminKey && (
        <p className="text-sm text-muted-foreground">
          This draft is full, so there is no seat to take — but you can watch.
        </p>
      )}

      {adminKey && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-1 font-semibold">Deal the packs</h2>
          {/*
            * How many packs are needed is not known until people have turned
            * up, since the table is the turnout rather than the cap — so
            * until there are two of them there is no number to show and
            * nothing useful to say about the Boosters page.
            */}
          {view.roster.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Two people at least, and then you can deal.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {view.roster.length} players × {view.rounds}{" "}
                {view.rounds === 1 ? "pack" : "packs"} — generate {needed} on
                the Boosters page, then come back here. Set, odds and options
                are all yours; the draft takes whatever you made.
              </p>
              <p className="mb-3 text-sm">
                {pool.length === 0 ? (
                  <>
                    Nothing generated in this tab yet.{" "}
                    <Link href="/" className="underline">
                      Go and make {needed} packs
                    </Link>
                    .
                  </>
                ) : pool.length < needed ? (
                  <>
                    {pool.length} packs ready, {needed} needed.{" "}
                    <Link href="/" className="underline">
                      Generate again
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    {pool.length} packs ready — the first {needed} will be
                    dealt, shuffled.
                  </>
                )}
              </p>
              <Button onClick={deal} disabled={busy || pool.length < needed}>
                {busy ? "Dealing…" : `Deal ${needed} packs`}
              </Button>
            </>
          )}
        </section>
      )}
    </>
  );
}
