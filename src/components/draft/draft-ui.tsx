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
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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
 * Where the page came in: the URL, and what this browser already remembered
 * about that room.
 *
 * Read through `useSyncExternalStore` rather than in an effect, because the
 * page is prerendered and neither the address bar nor `localStorage` exists
 * until it is in a browser. The snapshot is cached at module scope so that it
 * is the same object on every render — which is what that hook requires, and
 * is true in any case: arriving happens once.
 */
let arrival: Entry | null = null;

const howWeGotHere = (): Entry => {
  if (arrival) return arrival;
  const { code, seatKey, adminKey } = roomFromUrl(
    window.location.search,
    window.location.hash,
  );
  arrival = code
    ? {
        code,
        seat: seatKey ?? recallSeat(code),
        admin: adminKey ?? recallAdmin(code),
      }
    : NOBODY;
  return arrival;
};

const whilePrerendered = (): Entry => NOBODY;
const neverChanges = () => () => {};

export function DraftUi() {
  const came = useSyncExternalStore(
    neverChanges,
    howWeGotHere,
    whilePrerendered,
  );
  const [moved, setMoved] = useState<Entry | null>(null);
  const here = moved ?? came;

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
    if (!came.code) return;
    /*
     * Keys are written down twice: into `localStorage`, which is a cache that
     * Safari will drop after seven idle days, and back into the address bar,
     * which is bookmarkable and survives it. Either alone is a way to lose a
     * draft to a cleared browser.
     */
    if (came.seat) rememberSeat(came.code, came.seat);
    if (came.admin) rememberAdmin(came.code, came.admin);
    address(came.code, came);
  }, [came, address]);

  const enter = useCallback(
    (code: string, keys: Entered) => {
      if (keys.seat) rememberSeat(code, keys.seat);
      if (keys.admin) rememberAdmin(code, keys.admin);
      const next: Entry = {
        code,
        seat: keys.seat ?? recallSeat(code),
        admin: keys.admin ?? recallAdmin(code),
      };
      setMoved(next);
      address(code, next);
    },
    [address],
  );

  const leave = useCallback(() => {
    setMoved(NOBODY);
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
