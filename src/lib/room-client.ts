/*
 * The browser's side of the draft.
 *
 * Thin on purpose: the rules live in `lib/draft` and `lib/room/ops.ts`, both
 * of which run in the function, so there is nothing here but shaping requests
 * and remembering a key. Anything in this file that started deciding
 * something would be a second opinion about the draft.
 */
import type { Direction } from "@/lib/draft";
import type { PackCard, RoomView } from "@/lib/room";
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
  password?: string | null;
  json?: boolean;
}

const head = ({ key, password, json }: Heads): HeadersInit => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(key ? { "x-draft-key": key } : {}),
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

export const fetchRoom = (code: string, key: string | null) =>
  send<{ view: RoomView }>(`/${code}`, { headers: head({ key }) });

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
) =>
  send<{ seats: Record<string, number> }>(`/${code}/start`, {
    method: "POST",
    headers: head({ key: adminKey, json: true }),
    body: JSON.stringify({ packs }),
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

/* ------------------------------------------------------------------- URLs */

/**
 * What a URL says about which draft this is: `?room=K7MQ2F#s=9f3c…`.
 *
 * The code is in the query because it is read aloud and typed in, and is not
 * a secret. The seat key is in the **fragment**, which browsers never send to
 * a server — so it stays out of access logs and out of `Referer` headers,
 * where a query string would not.
 */
export function roomFromUrl(
  search: string,
  hash: string,
): { code: string | null; seatKey: string | null } {
  const code = tidyCode(new URLSearchParams(search).get("room") ?? "");
  const seatKey = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  ).get("s");
  return { code: code || null, seatKey: seatKey || null };
}

/** The link to hand one player. Anyone holding it is that player. */
export const seatLink = (
  origin: string,
  code: string,
  seatKey: string,
): string => `${origin}/draft?room=${code}#s=${seatKey}`;

/** The link to give everybody, which claims no seat. */
export const roomLink = (origin: string, code: string): string =>
  `${origin}/draft?room=${code}`;

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
