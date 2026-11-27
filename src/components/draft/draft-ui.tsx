"use client";

/*
 * The draft page: which room this is, and which of its faces to show.
 *
 * Everything about *when* the room is fetched is here, and it is the one place
 * the hosting bill is visible in the code. Nothing polls. The room is read
 * when the page opens, after your own pick, when the tab regains focus with
 * the view over a minute old, and when somebody presses Check for packs.
 * Netlify's free plan is a hard cap that pauses every site on the account, and
 * eight tabs asking every five seconds for three days would be four times the
 * monthly allowance — see docs/async-draft.md.
 *
 * Which is also the honest shape for the thing: an async draft is a mailbox.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  type Keys,
  DraftError,
  fetchRoom,
  recallAdmin,
  recallSeat,
  rememberAdmin,
  rememberSeat,
  roomFromUrl,
  roomHref,
} from "@/lib/room-client";
import { prettyCode } from "@/lib/room/codes";

import { DeckBuilder } from "./deck-builder";
import { DraftBoard } from "./draft-board";
import { RoomGate } from "./room-gate";
import { RoomLobby } from "./room-lobby";

/** How long a fetched room counts as fresh. Focus inside this re-uses it. */
const FRESH = 60_000;

/** Who this browser is in which draft. */
export interface Entry {
  code: string | null;
  seat: string | null;
  admin: string | null;
}

const NOBODY: Entry = { code: null, seat: null, admin: null };

/** The keys a join or a room-creation hands back. */
export interface Entered {
  seat?: string;
  admin?: string;
}

/*
 * Who this browser is, as a store rather than as state.
 *
 * Read through `useSyncExternalStore` because the page is prerendered and
 * neither the address bar nor `localStorage` exists until it is in a browser,
 * and the snapshot is cached at module scope so it is the same object on
 * every render, which that hook requires.
 *
 * It is a store and not a `useState` because three different things change
 * it — arriving, joining, and a link clicked while the page is already open
 * — and when they were split between a cached snapshot and a piece of state,
 * the state shadowed the snapshot and a clicked link did nothing.
 */
let arrival: Entry | null = null;
const listeners = new Set<() => void>();
const announce = (): void => listeners.forEach((tell) => tell());

const fromHere = (): Entry => {
  const { code, seatKey, adminKey } = roomFromUrl(
    window.location.search,
    window.location.hash,
  );
  return code
    ? {
        code,
        seat: seatKey ?? recallSeat(code),
        admin: adminKey ?? recallAdmin(code),
      }
    : NOBODY;
};

const howWeGotHere = (): Entry => (arrival ??= fromHere());

/*
 * A fragment that changes without the page reloading, which is exactly what
 * a reissued seat link does: same path, same `?room=`, a new `#s=`. The
 * browser treats that as a same-document navigation, so nothing would reread
 * it — and the one person who needs it to work is the player who has just
 * been sent a new link for the draft they are already looking at.
 */
const whenTheLinkChanges = (tell: () => void): (() => void) => {
  listeners.add(tell);
  const again = () => {
    arrival = fromHere();
    announce();
  };
  window.addEventListener("hashchange", again);
  return () => {
    listeners.delete(tell);
    window.removeEventListener("hashchange", again);
  };
};

/** This browser has become somebody: a new seat, a new room, or nobody. */
const nowWeAre = (entry: Entry): void => {
  arrival = entry;
  announce();
};

const whilePrerendered = (): Entry => NOBODY;

export function DraftUi() {
  const here = useSyncExternalStore(
    whenTheLinkChanges,
    howWeGotHere,
    whilePrerendered,
  );

  /*
   * The address bar always shows the whole way back in, keys and all.
   *
   * An earlier version stripped the keys out again, reasoning that a key in a
   * screenshot is a stolen seat. That traded the wrong thing away: the server
   * keeps only a hash of each key, so the link is the one copy that exists,
   * and hiding it from the address bar meant losing a browser lost the draft.
   * The keys are on screen anyway now, under Keep this link — so there was
   * nothing left for the stripping to protect.
   */
  const address = useCallback((code: string | null, keys?: Keys) => {
    history.replaceState(
      null,
      "",
      code ? roomHref(code, keys) : window.location.pathname,
    );
  }, []);

  useEffect(() => {
    if (!here.code) return;
    /*
     * Keys are written down twice: into `localStorage`, which is a cache that
     * Safari will drop after seven idle days, and back into the address bar,
     * which is bookmarkable and survives it. Either alone is a way to lose a
     * draft to a cleared browser.
     */
    if (here.seat) rememberSeat(here.code, here.seat);
    if (here.admin) rememberAdmin(here.code, here.admin);
    address(here.code, here);
  }, [here, address]);

  const enter = useCallback(
    (code: string, keys: Entered) => {
      if (keys.seat) rememberSeat(code, keys.seat);
      if (keys.admin) rememberAdmin(code, keys.admin);
      const next: Entry = {
        code,
        seat: keys.seat ?? recallSeat(code),
        admin: keys.admin ?? recallAdmin(code),
      };
      nowWeAre(next);
      address(code, next);
    },
    [address],
  );

  const leave = useCallback(() => {
    nowWeAre(NOBODY);
    address(null);
  }, [address]);

  /*
   * Both keys go up. The seat key says who you are; the admin key says you
   * may also deal and hand decks back, which whoever started the draft can do
   * while playing in it.
   */
  const room = useQuery({
    queryKey: ["draft", here.code, here.seat, here.admin],
    enabled: !!here.code,
    queryFn: () =>
      fetchRoom(here.code as string, here.seat, here.admin),
    staleTime: FRESH,
    refetchOnWindowFocus: true,
    retry: false,
  });

  if (!here.code) return <RoomGate onEnter={enter} />;

  if (room.isPending)
    return (
      <p className="text-sm text-muted-foreground">
        Looking for {prettyCode(here.code)}…
      </p>
    );

  if (room.error) {
    const why =
      room.error instanceof DraftError
        ? ({
            "no-such-room": `There is no draft called ${prettyCode(here.code)}.`,
            "stale-shape":
              "This draft was made by an older version of the site and cannot be read any more.",
            "no-storage": "This deploy of the site cannot serve drafts.",
          }[room.error.reason] ?? room.error.message)
        : "The draft could not be reached.";
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-destructive">{why}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void room.refetch()}>
            Try again
          </Button>
          <Button variant="ghost" onClick={leave}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  const view = room.data.view;
  const refresh = () => void room.refetch();

  if (view.phase === "setup")
    return (
      <RoomLobby
        view={view}
        seatKey={here.seat}
        adminKey={here.admin}
        onEnter={enter}
        onRefresh={refresh}
        onLeave={leave}
        refreshing={room.isFetching}
      />
    );

  /* Drafting is over, so the page stops being a draft and becomes a deck. */
  if (view.phase !== "drafting")
    return (
      <DeckBuilder
        view={view}
        seatKey={here.seat}
        adminKey={here.admin}
        onRefresh={refresh}
        onLeave={leave}
        refreshing={room.isFetching}
      />
    );

  return (
    <DraftBoard
      view={view}
      seatKey={here.seat}
      adminKey={here.admin}
      onRefresh={refresh}
      onLeave={leave}
      refreshing={room.isFetching}
    />
  );
}
