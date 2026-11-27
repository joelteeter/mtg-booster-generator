"use client";

/*
 * Where this browser stands in the draft, and the link that keeps it there.
 *
 * A draft's identity is a 128-bit key and the server stores only `hashKey` of
 * it, so nobody can be sent a lost one: rejoining is refused as `name-taken`,
 * and after the deal `joinRoom` refuses everybody. The key therefore has to
 * be somewhere a person can keep. It is in `localStorage`, which Safari
 * clears after seven idle days, and in the address bar, which a closed tab
 * forgets. This is the third place: on screen, in text, ready to be copied
 * somewhere that lasts.
 *
 * What counts as held is the *server's* answer, never the key sitting in this
 * browser — the same rule the admin controls follow. A key can stop being a
 * seat while the browser still has it, because the admin can mint a
 * replacement (see `newSeatKey`), and a page that called a dead key "your
 * seat" would be lying at the one moment it matters.
 */
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoomView } from "@/lib/room";
import { keyLink } from "@/lib/room-client";

/** What the link opens, said plainly, because the two are not the same risk. */
const what = (seat: boolean, admin: boolean): string => {
  if (seat && admin) return "your seat and the controls for this draft";
  if (admin) return "the controls for this draft";
  return "your seat in this draft";
};

export function WayBack({
  view,
  seatKey,
  adminKey,
}: {
  view: RoomView;
  seatKey: string | null;
  adminKey: string | null;
}) {
  /* Held keys the server still recognises, and held keys it does not. */
  const seat = view.role === "player" ? seatKey : null;
  const admin = view.admin ? adminKey : null;
  const deadSeat = !!seatKey && !seat;
  const deadAdmin = !!adminKey && !admin;

  const link =
    seat || admin
      ? keyLink(window.location.origin, view.code, { seat, admin })
      : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Copied. Put it somewhere you will still have it later.");
    } catch {
      toast.error("Could not copy — select the link and copy it by hand.");
    }
  };

  /*
   * A link that has been replaced. Worth saying outright rather than leaving
   * somebody to work out why the draft has stopped knowing them: the fix is
   * not something they can do from here.
   */
  const dead = (deadSeat || deadAdmin) && (
    <p className={link ? "mt-3 text-sm" : "text-sm"}>
      <b>
        {deadSeat && deadAdmin
          ? "This browser's old links no longer work."
          : deadSeat
            ? "This browser's seat link no longer works."
            : "This browser's admin link no longer works."}
      </b>{" "}
      <span className="text-muted-foreground">
        {deadSeat
          ? "Whoever is running the draft has issued a new one for that seat — ask them for it."
          : "Somebody else is running this draft now."}
      </span>
    </p>
  );

  if (!link) {
    /* Nothing held and nothing dead: a spectator needs only the code. */
    if (!dead) return null;
    return (
      <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        {dead}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 className="font-semibold">Keep this link</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It is {what(!!seat, !!admin)}, and it is the only copy. Bookmark it or
        send it to yourself — if this browser forgets, nobody can give it back
        to you. Anyone else who has it is you, so keep it to yourself.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={link}
          aria-label="Your link back into this draft"
          onFocus={(e) => e.currentTarget.select()}
          className="grow basis-64 font-mono text-xs"
        />
        <Button variant="outline" onClick={copy}>
          Copy my link
        </Button>
      </div>
      {dead}
    </section>
  );
}
