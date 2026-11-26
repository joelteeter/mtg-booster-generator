"use client";

/*
 * The link that is you.
 *
 * A draft runs for days across whatever browsers people happen to have, and
 * identity here is a 128-bit key rather than an account. The server stores
 * only `hashKey` of it, so there is nobody — not even the admin — who can
 * send a lost key back: rejoining under the same name is refused, and once
 * the packs are dealt there is no joining at all.
 *
 * So the key has to be somewhere a person can keep. It is in `localStorage`
 * and in the address bar, and both of those are things a browser throws away.
 * This is the third place: on screen, in text, ready to be copied somewhere
 * that lasts.
 */
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keyLink } from "@/lib/room-client";

/** What the link opens, said plainly, because the two are not the same risk. */
const what = (seat: boolean, admin: boolean): string => {
  if (seat && admin) return "your seat and the controls for this draft";
  if (admin) return "the controls for this draft";
  return "your seat in this draft";
};

export function WayBack({
  code,
  seatKey,
  adminKey,
}: {
  code: string;
  seatKey: string | null;
  adminKey: string | null;
}) {
  /* Nothing to keep, nothing to show — a spectator needs only the code. */
  if (!seatKey && !adminKey) return null;

  const link = keyLink(window.location.origin, code, {
    seat: seatKey,
    admin: adminKey,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Copied. Put it somewhere you will still have it later.");
    } catch {
      toast.error("Could not copy — select the link and copy it by hand.");
    }
  };

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 className="font-semibold">Keep this link</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It is {what(!!seatKey, !!adminKey)}, and it is the only copy. Bookmark
        it or send it to yourself — if this browser forgets, nobody can give it
        back to you. Anyone else who has it is you, so keep it to yourself.
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
    </section>
  );
}
