/*
 * The browser's side of the draft.
 *
 * Thin on purpose: the rules live in `lib/draft` and `lib/room/ops.ts`, both
 * of which run in the function, so there is nothing here but shaping requests
 * and remembering a key. Anything in this file that started deciding
 * something would be a second opinion about the draft.
 */
import type {
  Deck,
  DeckCheck,
  Direction,
  PoolSummary,
} from "@/lib/draft";
import type { DeckSheet, PackCard, RoomView } from "@/lib/room";
import { tidyCode } from "@/lib/room/codes";

const BASE = "/api/draft";

/** A refusal from the function, with the reason it gave. */
export class DraftError extends Error {
  constructor(
    readonly reason: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(detail ? `${reason} — ${detail}` : reason);
    this.name = "DraftError";
  }
}

interface Heads {
  key?: string | null;
  /** Sent alongside the seat key, since one browser can be both. */
  adminKey?: string | null;
  password?: string | null;
  json?: boolean;
}

const head = ({ key, adminKey, password, json }: Heads): HeadersInit => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(key ? { "x-draft-key": key } : {}),
  ...(adminKey ? { "x-draft-admin-key": adminKey } : {}),
  ...(password ? { "x-draft-password": password } : {}),
});

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    detail?: string;
  } | null;
  if (!res.ok)
    throw new DraftError(
      body?.error ?? "unreachable",
      res.status,
      body?.detail,
    );
  return body as T;
}

export interface NewRoomBody {
  maxSeats: number;
  rounds: number;
  picksPerTurn: number;
  pass: Direction[];
}

export const makeRoom = (body: NewRoomBody, password?: string) =>
  send<{ code: string; adminKey: string }>("", {
    method: "POST",
    headers: head({ password, json: true }),
    body: JSON.stringify(body),
  });

export const fetchRoom = (
  code: string,
  key: string | null,
  adminKey?: string | null,
) => send<{ view: RoomView }>(`/${code}`, { headers: head({ key, adminKey }) });

export const joinRoom = (code: string, name: string) =>
  send<{ playerId: string; playerKey: string; name: string }>(
    `/${code}/join`,
    {
      method: "POST",
      headers: head({ json: true }),
      body: JSON.stringify({ name }),
    },
  );

export const startRoom = (
  code: string,
  adminKey: string,
  packs: PackCard[][],
  summary?: PoolSummary | null,
) =>
  send<{ seats: Record<string, number> }>(`/${code}/start`, {
    method: "POST",
    headers: head({ adminKey, json: true }),
    body: JSON.stringify({ packs, summary }),
  });

export const sendPick = (
  code: string,
  key: string,
  packId: string,
  cards: string[],
) =>
  send<{ over: boolean }>(`/${code}/pick`, {
    method: "POST",
    headers: head({ key, json: true }),
    body: JSON.stringify({ packId, cards }),
  });

/**
 * Save a deck. `submit` is the difference between "this is where I got to"
 * and "this is finished" — only the second is checked for legality, because
 * a half-built deck is a normal thing for a deck to be.
 */
export const saveDeck = (
  code: string,
  key: string,
  deck: Deck,
  submit: boolean,
) =>
  send<{ check: DeckCheck; submitted: boolean }>(`/${code}/deck`, {
    method: "POST",
    headers: head({ key, json: true }),
    body: JSON.stringify({ deck, submit }),
  });

/** Admin: let somebody change a deck they have already handed in. */
export const unlockDeck = (code: string, adminKey: string, playerId: string) =>
  send<{ name: string }>(`/${code}/unlock`, {
    method: "POST",
    headers: head({ adminKey, json: true }),
    body: JSON.stringify({ playerId }),
  });

/**
 * Admin: mint a new seat key for a player whose link is gone.
 *
 * The reply carries the key itself, which is why nothing caches this and why
 * the caller shows it rather than storing it: this browser is not that seat,
 * it is just the one that has to pass the link on.
 */
export const newSeatKey = (
  code: string,
  adminKey: string,
  playerId: string,
) =>
  send<{ name: string; playerKey: string }>(`/${code}/rekey`, {
    method: "POST",
    headers: head({ adminKey, json: true }),
    body: JSON.stringify({ playerId }),
  });

/** Admin: everybody's decks, which is the only read that carries them. */
export const fetchDecks = (code: string, adminKey: string) =>
  send<{ decks: DeckSheet[] }>(`/${code}/decks`, {
    headers: head({ adminKey }),
  });

/* ------------------------------------------------------------------- URLs */

/** The keys a browser holds for one room: either, both, or neither. */
export interface Keys {
  seat?: string | null;
  admin?: string | null;
}

/**
 * What a URL says about which draft this is: `?room=K7MQ2F#s=9f3c…&a=61b2…`.
 *
 * The code is in the query because it is read aloud and typed in, and is not
 * a secret. The keys are in the **fragment**, which browsers never send to a
 * server — so they stay out of access logs and out of `Referer` headers,
 * where a query string would not.
 *
 * `s` is a seat and `a` is the admin. Both can be present at once, because
 * whoever started the draft may also be playing in it.
 */
export function roomFromUrl(
  search: string,
  hash: string,
): { code: string | null; seatKey: string | null; adminKey: string | null } {
  const code = tidyCode(new URLSearchParams(search).get("room") ?? "");
  const frag = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  return {
    code: code || null,
    seatKey: frag.get("s") || null,
    adminKey: frag.get("a") || null,
  };
}

/**
 * The address for a room, carrying whichever keys are given.
 *
 * One builder for every link the page makes, so there is a single answer to
 * what goes before the `#` and what goes after it. Keys are 128-bit hex, so
 * nothing here needs escaping, but they go through `URLSearchParams` anyway
 * rather than being pasted together by hand.
 */
export function roomHref(code: string, keys: Keys = {}): string {
  const frag = new URLSearchParams();
  if (keys.seat) frag.set("s", keys.seat);
  if (keys.admin) frag.set("a", keys.admin);
  const tail = frag.toString();
  return `/draft?room=${code}${tail ? `#${tail}` : ""}`;
}

/**
 * Somebody's way back into a draft. Anyone holding it is them.
 *
 * This is the record, and the only one: the server keeps a hash of each key
 * and never the key, so a lost link cannot be reissued by anybody. Which is
 * why the page shows it rather than quietly filing it in `localStorage`.
 */
export const keyLink = (
  origin: string,
  code: string,
  keys: Keys = {},
): string => origin + roomHref(code, keys);

/** The link to give everybody, which claims no seat and no controls. */
export const roomLink = (origin: string, code: string): string =>
  keyLink(origin, code);

/* ---------------------------------------------------------------- storage */

/**
 * `localStorage`, or null where it is unreachable — a private window, or site
 * data blocked. Every caller copes with null, because the key is a cache: the
 * link is the record. Safari clears script-writable storage for a site nobody
 * has visited for seven days, and a draft runs longer than that.
 */
export function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const seatSlot = (code: string) => `draft:${code}`;
const adminSlot = (code: string) => `draft:admin:${code}`;

const put = (store: Storage | null, slot: string, value: string): void => {
  try {
    store?.setItem(slot, value);
  } catch {
    /* Out of quota, or blocked. The link still works. */
  }
};

const get = (store: Storage | null, slot: string): string | null => {
  try {
    return store?.getItem(slot) ?? null;
  } catch {
    return null;
  }
};

export const rememberSeat = (
  code: string,
  key: string,
  store: Storage | null = safeLocal(),
) => put(store, seatSlot(code), key);

export const recallSeat = (
  code: string,
  store: Storage | null = safeLocal(),
) => get(store, seatSlot(code));

export const rememberAdmin = (
  code: string,
  key: string,
  store: Storage | null = safeLocal(),
) => put(store, adminSlot(code), key);

export const recallAdmin = (
  code: string,
  store: Storage | null = safeLocal(),
) => get(store, adminSlot(code));
