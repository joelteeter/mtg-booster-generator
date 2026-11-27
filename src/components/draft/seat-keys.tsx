"use client";

/*
 * The admin's answer to "I have lost my link".
 *
 * There is nothing to look up. A seat key is stored as a hash of itself, so
 * the admin cannot be shown anybody's link — only mint a new one, which is
 * what this does. The seat keeps every card it has drafted; the key is the
 * only thing that changes.
 *
 * Deliberately on every screen the admin sees, because the moment this is
 * needed is the middle of a draft, not the lobby.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoomView } from "@/lib/room";
import { DraftError, keyLink, newSeatKey } from "@/lib/room-client";

/** A link just minted, held until the admin has sent it on. */
interface Issued {
  playerId: string;
  name: string;
  link: string;
}

export function SeatKeys({
  view,
  adminKey,
  onRefresh,
}: {
  view: RoomView;
  adminKey: string;
  onRefresh: () => void;
}) {
  /* Which row has asked "are you sure", and the link that came back. */
  const [asking, setAsking] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);

  const mint = async (playerId: string) => {
    setBusy(true);
    try {
      const made = await newSeatKey(view.code, adminKey, playerId);
      setIssued({
        playerId,
        name: made.name,
        link: keyLink(window.location.origin, view.code, {
          seat: made.playerKey,
        }),
      });
      setAsking(null);
      toast.success(`New link for ${made.name}. Their old one has stopped.`);
      /*
       * Re-read, because the admin may have just re-keyed themselves — and
       * until the view catches up the page would go on calling a retired key
       * their seat.
       */
      onRefresh();
    } catch (e) {
      const why =
        e instanceof DraftError
          ? {
              "not-admin": "This browser is not the admin of this draft.",
              "not-a-player": "That player is not in this draft any more.",
            }[e.reason]
          : undefined;
      toast.error(why ?? "Could not make a new link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Copied. Send it to them.");
    } catch {
      toast.error("Could not copy — select the link and copy it by hand.");
    }
  };

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">Players</h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">
        Nobody can be shown their own link from here — only a hash of it is
        kept. If somebody has lost theirs, make them a new one. Their cards and
        deck are untouched; the old link stops working.
      </p>

      <ul className="flex flex-col gap-1.5">
        {view.roster.map((p) => (
          <li key={p.name} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-32 truncate">{p.name}</span>
            <span className="w-16 text-xs text-muted-foreground">
              {p.seat === null ? "unseated" : `seat ${p.seat + 1}`}
            </span>
            {!p.id ? null : asking === p.id ? (
              <>
                <span className="text-xs text-amber-700 dark:text-amber-500">
                  Stops their old link.
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void mint(p.id as string)}
                >
                  {busy ? "Making…" : "Yes, new link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setAsking(null)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setAsking(p.id as string)}
              >
                New link
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/*
        * Shown until it is dismissed rather than toasted away: it is the only
        * copy of that key, and the admin still has to get it to a person.
        */}
      {issued && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm">
            <b>{issued.name}&rsquo;s new link.</b>{" "}
            <span className="text-muted-foreground">
              Send it to them. It will not be shown again, and their old link
              no longer works.
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={issued.link}
              aria-label={`New link for ${issued.name}`}
              onFocus={(e) => e.currentTarget.select()}
              className="grow basis-64 font-mono text-xs"
            />
            <Button variant="outline" onClick={() => void copy(issued.link)}>
              Copy
            </Button>
            <Button variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
