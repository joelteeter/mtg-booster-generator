/*
 * What a room can be asked to do: make one, join one, deal it, pick from it,
 * look at it.
 *
 * These are the only things that touch storage, and they do it through the
 * `Store` port so the whole lifecycle can be driven in Vitest against a fake
 * that honours the same conditions. The handler in `netlify/functions/` turns
 * HTTP into one of these calls and its result back into a response; it holds
 * no rules, the way the pick handler holds none of the draft's.
 *
 * Every refusal is a value rather than an exception. A thrown error in here
 * means corrupt data — a pool that does not match a state — and should be a
 * 500, which is a different thing from a player being told no.
 */
/* Relative rather than aliased — see the note in `types.ts`. */
import { dealPacks, poolKeys, seatOrder } from "../draft/deal";
import { checkDeck, poolOf, problemText } from "../draft/deck";
import type { BasicLand, Deck, DeckCheck } from "../draft/deck";
import { applyPick, isOver } from "../draft/engine";
import type {
  CardRef,
  Direction,
  DraftRules,
  PickRefusal,
  Pool,
  PoolSummary,
  Rng,
  Taken,
} from "../draft/types";
import { boardView, cardRefs, seatView } from "../draft/view";
import type { BoardView, SeatView } from "../draft/view";

import { hashKey, roomCode, secretKey } from "./codes";
import type { Bytes } from "./codes";
import { SHAPE } from "./types";
import type { DraftRow, Phase, PickRow, PlayerRow, Store } from "./types";

export type RoomRefusal =
  | "no-such-room"
  | "stale-shape"
  | "not-admin"
  | "not-a-player"
  | "no-seat"
  | "wrong-phase"
  | "room-full"
  | "name-taken"
  | "not-enough-players"
  | "bad-name"
  | "bad-rules"
  | "bad-pool"
  | "bad-pick"
  | "bad-deck"
  | "lost-race";

export interface Refused {
  ok: false;
  reason: RoomRefusal | PickRefusal;
  /** For the admin and the logs. Never a secret. */
  detail?: string;
}

export type Outcome<T> = ({ ok: true } & T) | Refused;

const no = (reason: RoomRefusal | PickRefusal, detail?: string): Refused => ({
  ok: false,
  reason,
  ...(detail === undefined ? {} : { detail }),
});

/*
 * Limits, so one bad request cannot make a draft nobody could finish or a
 * pool nobody could store. Generous rather than tight: twelve seats is more
 * than a table seats, and sixty cards is more than any booster holds.
 */
const SEATS = [2, 12] as const;
const ROUNDS = [1, 6] as const;
const PER_TURN = [1, 2] as const;
const PACK_CARDS = [1, 60] as const;
const POOL_CARDS = 1200;
const NAME_CHARS = 40;
/* Bounds on a posted deck, so a stray request cannot be enormous. */
const MAIN_MAX = 300;
const SIDE_MAX = 50;

const whole = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

const within = (n: number, [lo, hi]: readonly [number, number]): boolean =>
  n >= lo && n <= hi;

/* ------------------------------------------------------------- make one */

export interface NewRoom {
  maxSeats: number;
  rounds: number;
  picksPerTurn: number;
  pass: Direction[];
  printBasics: boolean;
}

export function parseNewRoom(body: unknown): Outcome<{ room: NewRoom }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const maxSeats = whole(b.maxSeats);
  const rounds = whole(b.rounds);
  const picksPerTurn = whole(b.picksPerTurn);

  if (maxSeats === null || !within(maxSeats, SEATS))
    return no("bad-rules", `maxSeats must be ${SEATS[0]} to ${SEATS[1]}`);
  if (rounds === null || !within(rounds, ROUNDS))
    return no("bad-rules", `rounds must be ${ROUNDS[0]} to ${ROUNDS[1]}`);
  if (picksPerTurn === null || !within(picksPerTurn, PER_TURN))
    return no("bad-rules", "picksPerTurn must be 1 or 2");

  const pass = Array.isArray(b.pass) ? b.pass : [];
  if (!pass.length || pass.some((d) => d !== "left" && d !== "right"))
    return no("bad-rules", "pass must be a non-empty list of left and right");

  return {
    ok: true,
    room: {
      maxSeats,
      rounds,
      picksPerTurn,
      pass: pass as Direction[],
      printBasics: b.printBasics === true,
    },
  };
}

export interface Clock {
  bytes?: Bytes;
  now?: () => string;
}

export async function createRoom(
  store: Store,
  body: unknown,
  clock: Clock = {},
): Promise<Outcome<{ code: string; adminKey: string }>> {
  const parsed = parseNewRoom(body);
  if (!parsed.ok) return parsed;
  const { room } = parsed;

  const adminKey = secretKey(clock.bytes);
  const adminHash = await hashKey(adminKey);
  const createdAt = (clock.now ?? (() => new Date().toISOString()))();

  /*
   * `rules.seats` starts at the cap and is narrowed to the turnout when the
   * draft is dealt — the admin generates the packs after seeing who came, so
   * the seat count is not known until then.
   */
  const rules: DraftRules = {
    seats: room.maxSeats,
    rounds: room.rounds,
    picksPerTurn: room.picksPerTurn,
    pass: room.pass,
  };

  for (let tries = 0; tries < 5; tries++) {
    const code = roomCode(clock.bytes);
    const made = await store.createDraft({
      code,
      phase: "setup",
      shape: SHAPE,
      rev: 0,
      rules,
      pool: {},
      state: null,
      summary: null,
      seats: {},
      adminHash,
      maxSeats: room.maxSeats,
      printBasics: room.printBasics,
      createdAt,
    });
    if (made) return { ok: true, code, adminKey };
  }
  return no("lost-race", "could not find a free room code");
}

/* ----------------------------------------------------------------- join */

const liveRoom = async (
  store: Store,
  code: string,
  wanted: Phase | null,
): Promise<Outcome<{ row: DraftRow }>> => {
  const row = await store.getDraft(code);
  if (!row) return no("no-such-room");
  if (row.shape !== SHAPE)
    return no(
      "stale-shape",
      `this draft was made at layout ${row.shape}; this deploy reads ${SHAPE}`,
    );
  if (wanted && row.phase !== wanted)
    return no("wrong-phase", `the room is ${row.phase}, not ${wanted}`);
  return { ok: true, row };
};

export async function joinRoom(
  store: Store,
  code: string,
  name: unknown,
  clock: Clock = {},
): Promise<Outcome<{ playerId: string; playerKey: string; name: string }>> {
  const tidy = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!tidy || tidy.length > NAME_CHARS)
    return no("bad-name", `a name is 1 to ${NAME_CHARS} characters`);

  const room = await liveRoom(store, code, "setup");
  if (!room.ok) return room;

  const playerKey = secretKey(clock.bytes);
  const player: PlayerRow = {
    code,
    id: secretKey(clock.bytes).slice(0, 16),
    name: tidy,
    keyHash: await hashKey(playerKey),
    joinedAt: (clock.now ?? (() => new Date().toISOString()))(),
  };

  const outcome = await store.addPlayer(player, room.row.maxSeats);
  if (outcome === "room-full") return no("room-full");
  if (outcome === "name-taken") return no("name-taken");
  return { ok: true, playerId: player.id, playerKey, name: tidy };
}

/* ----------------------------------------------------------------- deal */

/** One card as the admin's browser uploads it, straight off the generator. */
export interface PackCard {
  id: string;
  finish: string;
}

const parsePacks = (
  value: unknown,
  need: number,
): Outcome<{ packs: PackCard[][] }> => {
  if (!Array.isArray(value) || value.length !== need)
    return no("bad-pool", `expected ${need} packs, got ${
      Array.isArray(value) ? value.length : "none"
    }`);

  const packs: PackCard[][] = [];
  let total = 0;
  for (const pack of value) {
    if (!Array.isArray(pack) || !within(pack.length, PACK_CARDS))
      return no(
        "bad-pool",
        `a pack holds ${PACK_CARDS[0]} to ${PACK_CARDS[1]} cards`,
      );
    const cards: PackCard[] = [];
    for (const card of pack) {
      const c = (card ?? {}) as Record<string, unknown>;
      if (typeof c.id !== "string" || !c.id)
        return no("bad-pool", "every card needs a Scryfall id");
      if (typeof c.finish !== "string" || !c.finish)
        return no("bad-pool", "every card needs a finish");
      cards.push({ id: c.id, finish: c.finish });
    }
    total += cards.length;
    if (total > POOL_CARDS)
      return no("bad-pool", `a draft holds at most ${POOL_CARDS} cards`);
    packs.push(cards);
  }
  return { ok: true, packs };
};

/* Bounds on the summary, which is free text from the admin's own browser. */
const CHANGES_MAX = 80;
const CHANGE_CHARS = 500;

/**
 * How the pool was made, if the admin's page said.
 *
 * Returns null rather than refusing when it is missing or malformed: a draft
 * that deals is worth more than one that refuses over a caption, and a room
 * made before this existed has no summary either. What it will not do is
 * store something unbounded.
 */
const parseSummary = (value: unknown): PoolSummary | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const changes = Array.isArray(v.changes)
    ? v.changes
        .filter((c): c is string => typeof c === "string" && !!c)
        .slice(0, CHANGES_MAX)
        .map((c) => c.slice(0, CHANGE_CHARS))
    : [];
  const packs = whole(v.packs);
  if (typeof v.setCode !== "string" || !v.setCode) return null;
  return {
    setCode: v.setCode.slice(0, 10).toUpperCase(),
    mode: typeof v.mode === "string" ? v.mode.slice(0, 20) : "",
    packs: packs !== null && packs >= 0 ? packs : 0,
    vanilla: v.vanilla === true,
    changes,
  };
};

/**
 * Shuffle the players into seats, shuffle the packs, and open round one.
 *
 * The seat count is set here rather than at creation: the admin generates the
 * packs once they can see who turned up, so the room's `maxSeats` is a cap on
 * joining and the turnout is the table.
 */
export async function startDraft(
  store: Store,
  code: string,
  adminKey: string,
  packs: unknown,
  rng: Rng = Math.random,
  summary?: unknown,
): Promise<Outcome<{ seats: Record<string, number>; rules: DraftRules }>> {
  const room = await liveRoom(store, code, "setup");
  if (!room.ok) return room;
  const { row } = room;

  if ((await hashKey(adminKey)) !== row.adminHash) return no("not-admin");

  const players = await store.listPlayers(code);
  if (players.length < SEATS[0])
    return no("not-enough-players", `a draft needs ${SEATS[0]} players`);

  const rules: DraftRules = { ...row.rules, seats: players.length };
  const parsed = parsePacks(packs, rules.seats * rules.rounds);
  if (!parsed.ok) return parsed;

  const keys = poolKeys(parsed.packs.map((p) => p.length));
  const pool: Pool = {};
  parsed.packs.forEach((pack, i) =>
    pack.forEach((card, j) => {
      pool[keys[i][j]] = { id: card.id, finish: card.finish };
    }),
  );

  const seats: Record<string, number> = {};
  seatOrder(players, rng).forEach((p, seat) => {
    seats[p.id] = seat;
  });

  /* One write: the packs, the pool, the table and the seats, or none of it. */
  const state = dealPacks(keys, rules, rng);
  const dealt = await store.putDraft(code, row.rev, {
    phase: "drafting",
    rules,
    pool,
    state,
    seats,
    summary: parseSummary(summary),
  });
  if (!dealt) return no("lost-race", "the room changed while it was dealing");

  return { ok: true, seats, rules };
}

/* ----------------------------------------------------------------- pick */

/**
 * Who is asking.
 *
 * Playing and running the draft are separate facts rather than one role,
 * because the usual case is both: whoever organises it is also in it. A
 * request carries a seat key and an admin key independently, and either may
 * be absent.
 */
interface Caller {
  player: PlayerRow | null;
  admin: boolean;
}

/** Where a player is sitting, or null before the draft is dealt. */
const seatOf = (row: DraftRow, player: PlayerRow | null): number | null =>
  player && player.id in row.seats ? row.seats[player.id] : null;

const whoIs = async (
  row: DraftRow,
  players: readonly PlayerRow[],
  key: string | null,
  adminKey?: string | null,
): Promise<Caller> => {
  const hash = key ? await hashKey(key) : null;
  const player = hash
    ? (players.find((p) => p.keyHash === hash) ?? null)
    : null;
  /*
   * Either key proves the admin: one browser holding both sends the seat key
   * as its identity, and an admin who is not playing has only the one.
   */
  const adminHash = adminKey ? await hashKey(adminKey) : null;
  const admin = row.adminHash === hash || row.adminHash === adminHash;
  return { player, admin };
};

export async function makePick(
  store: Store,
  code: string,
  key: string | null,
  packId: unknown,
  cards: unknown,
): Promise<Outcome<{ taken: Taken[]; over: boolean }>> {
  if (typeof packId !== "string" || !packId)
    return no("bad-pick", "which pack?");
  if (
    !Array.isArray(cards) ||
    !cards.length ||
    cards.some((c) => typeof c !== "string")
  )
    return no("bad-pick", "which cards?");

  const room = await liveRoom(store, code, "drafting");
  if (!room.ok) return room;
  const { row } = room;
  if (!row.state) return no("wrong-phase", "the room has not been dealt");

  const who = await whoIs(row, await store.listPlayers(code), key);
  if (!who.player) return no("not-a-player");
  const seat = seatOf(row, who.player);
  if (seat === null) return no("no-seat");

  const picked = applyPick(row.state, {
    seat,
    packId,
    cards: cards as string[],
  });
  if (!picked.ok) return no(picked.reason);

  const over = isOver(picked.state);
  const wrote = await store.putDraft(code, row.rev, {
    state: picked.state,
    ...(over ? { phase: "building" as Phase } : {}),
  });
  /*
   * Somebody else wrote first, so this pick was computed against a draft that
   * no longer exists and nothing has changed. Deliberately its own reason
   * rather than `not-your-pack`: the pick is probably still perfectly legal,
   * so the client should re-read and send it again by itself, where telling
   * the player their pack had moved on would be a lie and a lost click.
   *
   * Worth knowing why this can happen at all. The whole draft is one row, so
   * two picks from two different packs still serialise against the same `rev`
   * and one of them loses. Normalising packs into rows of their own would
   * remove that, and at eight people picking a few times a day it would be
   * removing nothing.
   */
  if (!wrote) return no("lost-race", "somebody else picked first");

  /*
   * The log is written after the state and is allowed to fail: a missing row
   * costs the replay a pick, while a row written before a state that then
   * failed to save would be a pick that never happened. Of the two holes,
   * this is the one to have.
   */
  const rows: PickRow[] = [
    {
      code,
      at: picked.state.clock,
      seat,
      packId,
      cards: picked.taken.map((t) => t.card),
    },
  ];
  await store.logPicks(rows).catch(() => {});

  return { ok: true, taken: picked.taken, over };
}

/* ----------------------------------------------------------------- deck */

const strings = (v: unknown, max: number): string[] | null =>
  Array.isArray(v) &&
  v.length <= max &&
  v.every((x) => typeof x === "string" && x)
    ? (v as string[])
    : null;

/**
 * A deck off the wire, or null if it is not one.
 *
 * Shape only. Whether it is a *legal* deck is `checkDeck`'s to say, and it
 * says it for the browser too — so there is one answer rather than a server
 * opinion and a client one that drift apart.
 */
const parseDeck = (value: unknown): Deck | null => {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  const main = strings(d.main, MAIN_MAX);
  const side = strings(d.side, SIDE_MAX);
  if (!main || !side) return null;

  const given = d.basics ?? {};
  if (typeof given !== "object" || Array.isArray(given)) return null;
  const basics: Record<string, number> = {};
  for (const [name, count] of Object.entries(given as Record<string, unknown>)) {
    if (typeof count !== "number") return null;
    basics[name] = count;
  }
  return { main, side, basics: basics as Deck["basics"] };
};

/**
 * Save a deck, finished or not.
 *
 * Saving an unfinished one is the point: a draft runs over days and so does
 * building, and nobody should have to do it in one sitting or keep it in a
 * browser that Safari will clear. Only submitting is checked — an illegal
 * work in progress is a normal state for a deck to be in.
 *
 * Editing after submitting un-submits, which is deliberate. The alternative
 * is a deck the admin has printed quietly changing underneath them.
 */
export async function saveDeck(
  store: Store,
  code: string,
  key: string | null,
  body: unknown,
  clock: Clock = {},
): Promise<Outcome<{ check: DeckCheck; submitted: boolean }>> {
  const room = await liveRoom(store, code, "building");
  if (!room.ok) return room;
  const { row } = room;
  if (!row.state) return no("wrong-phase", "the room has not been dealt");

  const who = await whoIs(row, await store.listPlayers(code), key);
  if (!who.player) return no("not-a-player");
  const seat = seatOf(row, who.player);
  if (seat === null) return no("no-seat");

  const sent = (body ?? {}) as Record<string, unknown>;
  const deck = parseDeck(sent.deck);
  if (!deck) return no("bad-deck", "that is not a deck");
  const submit = sent.submit === true;

  const check = checkDeck(deck, poolOf(row.state.picked[seat] ?? []));
  if (submit && !check.ok)
    return no("bad-deck", check.problems.map(problemText).join(" "));

  const when = submit
    ? (clock.now ?? (() => new Date().toISOString()))()
    : null;
  if (!(await store.putDeck(code, who.player.id, deck, when)))
    return no("not-a-player");

  return { ok: true, check, submitted: submit };
}

/** Let somebody change a deck they have already handed in. Admin only. */
export async function unlockDeck(
  store: Store,
  code: string,
  adminKey: string,
  playerId: unknown,
): Promise<Outcome<{ name: string }>> {
  const room = await liveRoom(store, code, "building");
  if (!room.ok) return room;
  if ((await hashKey(adminKey)) !== room.row.adminHash) return no("not-admin");
  if (typeof playerId !== "string" || !playerId)
    return no("bad-deck", "which player?");

  const player = (await store.listPlayers(code)).find(
    (p) => p.id === playerId,
  );
  if (!player) return no("not-a-player");

  /* The deck itself is kept; only the saying-it-is-finished is undone. */
  if (!(await store.putDeck(code, playerId, player.deck ?? null, null)))
    return no("not-a-player");
  return { ok: true, name: player.name };
}

/* ---------------------------------------------------------------- print */

/** One player's deck, as the cards it is made of. For the admin alone. */
export interface DeckSheet {
  playerId: string;
  name: string;
  seat: number;
  submitted: boolean;
  main: CardRef[];
  side: CardRef[];
  basics: Partial<Record<BasicLand, number>>;
}

/**
 * Every deck in the draft, for printing.
 *
 * The one place a request is answered with somebody else's cards, which is
 * why it is admin-only and separate from `readRoom` rather than a branch
 * inside it: a view that *sometimes* carries everybody's decks is one
 * mistaken condition away from always carrying them.
 *
 * Players without a deck are still listed, so the admin can see who is
 * missing rather than inferring it from a gap.
 */
export async function allDecks(
  store: Store,
  code: string,
  adminKey: string,
): Promise<Outcome<{ decks: DeckSheet[] }>> {
  const room = await liveRoom(store, code, null);
  if (!room.ok) return room;
  const { row } = room;
  if (!row.state) return no("wrong-phase", "the draft has not been dealt");
  if ((await hashKey(adminKey)) !== row.adminHash) return no("not-admin");

  const decks: DeckSheet[] = [];
  for (const player of await store.listPlayers(code)) {
    const seat = seatOf(row, player);
    if (seat === null) continue;
    const deck = player.deck ?? { main: [], side: [], basics: {} };
    decks.push({
      playerId: player.id,
      name: player.name,
      seat,
      submitted: !!player.submittedAt,
      main: cardRefs(row.pool, deck.main),
      side: cardRefs(row.pool, deck.side),
      basics: deck.basics,
    });
  }
  decks.sort((a, b) => a.seat - b.seat);
  return { ok: true, decks };
}

/* ----------------------------------------------------------------- read */

export interface RoomView {
  code: string;
  phase: Phase;
  rounds: number;
  maxSeats: number;
  printBasics: boolean;
  /** Whether this browser is playing in the draft. */
  role: "player" | "guest";
  /** Whether it is also running it. Both are true for whoever started it. */
  admin: boolean;
  /**
   * Everyone in the room. Seats are null until it is dealt.
   *
   * `id` is there for the admin alone, who needs it to hand a deck back. It
   * is not a secret — it authorises nothing — but it is nobody else's
   * business either, and the rule here is that a view carries what its reader
   * can act on.
   */
  roster: {
    name: string;
    seat: number | null;
    submitted: boolean;
    id?: string;
  }[];
  /** Null before the deal. Carries no cards — see `lib/draft/view.ts`. */
  board: BoardView | null;
  /** Null for a guest, and for an admin who is not also playing. */
  you: SeatView | null;
  /** How the pool was made. Public: everyone drafting it should know. */
  summary: PoolSummary | null;
  /** Your deck as last saved, which may be half-built. */
  deck: Deck | null;
  /** Whether you have called it finished. */
  submitted: boolean;
}

export async function readRoom(
  store: Store,
  code: string,
  key: string | null,
  adminKey?: string | null,
): Promise<Outcome<{ view: RoomView }>> {
  const room = await liveRoom(store, code, null);
  if (!room.ok) return room;
  const { row } = room;

  const players = await store.listPlayers(code);
  const who = await whoIs(row, players, key, adminKey);

  const names: (string | undefined)[] = [];
  for (const p of players) {
    const at = seatOf(row, p);
    if (at !== null) names[at] = p.name;
  }

  const seat = seatOf(row, who.player);
  return {
    ok: true,
    view: {
      code,
      phase: row.phase,
      rounds: row.rules.rounds,
      maxSeats: row.maxSeats,
      printBasics: row.printBasics,
      role: who.player ? "player" : "guest",
      admin: who.admin,
      roster: players
        .map((p) => ({
          name: p.name,
          seat: seatOf(row, p),
          submitted: !!p.submittedAt,
          ...(who.admin ? { id: p.id } : {}),
        }))
        .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99)),
      summary: row.summary,
      board: row.state ? boardView(row.state, names) : null,
      you: row.state && seat !== null ? seatView(row.state, row.pool, seat) : null,
      deck: who.player?.deck ?? null,
      submitted: !!who.player?.submittedAt,
    },
  };
}
