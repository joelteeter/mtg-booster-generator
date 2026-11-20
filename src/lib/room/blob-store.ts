/*
 * The `Store` port on object storage, with no transactions and no database.
 *
 * Netlify Database was the first plan and is metered by how long it stays
 * awake, with a five-minute floor on the free plan and a cap of 48 hours a
 * month. An async draft is made of requests minutes or hours apart — that is
 * the whole premise — so one spread-out draft could exhaust the cap by itself.
 * Blobs has no such meter: the function invocation is the only cost.
 *
 * What that costs is transactions, and the way round it is the revision
 * chain. A draft is a sequence of immutable blobs, `rev/0000`, `rev/0001`, and
 * a write means creating the next one with `setIfNew`. **The key is the
 * lock**: two requests that both computed from revision 7 both try to create
 * `rev/0008`, exactly one succeeds, and the loser is told so — which is the
 * same `rev`-conditional update the SQL version did, expressed as a filename.
 *
 * It is append-only, so it is also a second backup beside the pick log: every
 * state the draft was ever in is still there.
 */
import type { Deck } from "../draft/deck";

import type { Bucket } from "./bucket";
import type {
  DraftPatch,
  DraftRow,
  JoinOutcome,
  PickRow,
  PlayerRow,
  Store,
} from "./types";

/** Four digits, so that lexicographic order is numeric order. */
const WIDTH = 4;
const seq = (n: number): string => String(n).padStart(WIDTH, "0");

/** A draft of more revisions than this would break the ordering. */
export const MAX_REV = 10 ** WIDTH - 1;

const revKey = (code: string, rev: number): string =>
  `rooms/${code}/rev/${seq(rev)}`;
const seatKey = (code: string, slot: number): string =>
  `rooms/${code}/seat/${seq(slot)}`;
const pickKey = (code: string, at: number): string =>
  `rooms/${code}/pick/${seq(at)}`;

/**
 * How far past the newest *listed* revision to look for an unlisted one.
 *
 * Object storage lists are allowed to lag writes even where reading a key by
 * name does not, so a list alone could miss the revision that was just
 * created and hand back a draft one pick out of date — which would then lose
 * its own write and look like contention. Probing forward by name closes that:
 * revisions are consecutive, so the first miss is the end.
 */
const PROBE = 64;

const tail = (key: string): number =>
  Number(key.slice(key.lastIndexOf("/") + 1));

const lower = (s: string): string => s.toLowerCase();

export function blobStore(bucket: Bucket): Store {
  /** The newest revision of a draft, or null if there is no such draft. */
  const latest = async (code: string): Promise<DraftRow | null> => {
    const keys = await bucket.list(`rooms/${code}/rev/`);
    let row: DraftRow | null = null;
    let rev = -1;

    if (keys.length) {
      const newest = keys[keys.length - 1];
      rev = tail(newest);
      row = ((await bucket.get(newest)) ?? null) as DraftRow | null;
    }

    for (let next = rev + 1; next <= rev + PROBE; next++) {
      const found = await bucket.get(revKey(code, next));
      if (!found) break;
      row = found as DraftRow;
    }
    return row;
  };

  /** Players with the slot each one claimed; the slot is the join order. */
  const seated = async (
    code: string,
  ): Promise<{ slot: number; player: PlayerRow }[]> => {
    const keys = await bucket.list(`rooms/${code}/seat/`);
    const found = await Promise.all(
      keys.map(async (key) => ({
        slot: tail(key),
        player: ((await bucket.get(key)) ?? null) as PlayerRow | null,
      })),
    );
    return found
      .filter((f): f is { slot: number; player: PlayerRow } => !!f.player)
      .sort((a, b) => a.slot - b.slot);
  };

  return {
    async createDraft(row: DraftRow): Promise<boolean> {
      return bucket.setIfNew(revKey(row.code, 0), { ...row, rev: 0 });
    },

    getDraft: latest,

    async putDraft(
      code: string,
      rev: number,
      patch: DraftPatch,
    ): Promise<boolean> {
      const row = await latest(code);
      /*
       * Checking the revision here is a courtesy that saves a pointless write;
       * it is not what makes this safe. `setIfNew` is, and it is the only
       * thing that is: between this read and that write somebody else may
       * arrive, and they will find the key taken.
       */
      if (!row || row.rev !== rev || rev >= MAX_REV) return false;
      return bucket.setIfNew(revKey(code, rev + 1), {
        ...row,
        ...patch,
        rev: rev + 1,
      });
    },

    async listPlayers(code: string): Promise<PlayerRow[]> {
      return (await seated(code)).map((s) => s.player);
    },

    /*
     * Joining is two claims. The slot bounds the room — slots run from 0 to
     * `maxSeats - 1`, each can only be created once, so two people cannot take
     * the same one and nobody can take an eighth seat in a seven-seat room.
     *
     * The name cannot be claimed that way, so it is settled afterwards by a
     * rule both racers apply identically: among players sharing a name, the
     * lowest slot keeps it and anybody above withdraws. No transaction, and no
     * dependence on who read first.
     *
     * Where that degrades is if the list has not caught up and neither sees
     * the other, which leaves two people called Dev. Worth knowing and not
     * worth more machinery: it is a courtesy, and the draft does not care.
     */
    async addPlayer(row: PlayerRow, maxSeats: number): Promise<JoinOutcome> {
      let slot = -1;
      for (let i = 0; i < maxSeats; i++)
        if (await bucket.setIfNew(seatKey(row.code, i), row)) {
          slot = i;
          break;
        }
      if (slot < 0) return "room-full";

      const already = (await seated(row.code)).some(
        (s) => s.slot < slot && lower(s.player.name) === lower(row.name),
      );
      if (already) {
        await bucket.delete(seatKey(row.code, slot));
        return "name-taken";
      }
      return "joined";
    },

    /*
     * A player's row has one writer, so this overwrites rather than racing.
     * The slot has to be looked up because the row is keyed by it and a
     * `PlayerRow` does not carry its own seat.
     */
    async putDeck(
      code: string,
      playerId: string,
      deck: Deck | null,
      submittedAt: string | null,
    ): Promise<boolean> {
      const mine = (await seated(code)).find((s) => s.player.id === playerId);
      if (!mine) return false;
      await bucket.set(seatKey(code, mine.slot), {
        ...mine.player,
        deck,
        submittedAt,
      });
      return true;
    },

    /*
     * Keyed by the clock, which is unique within a draft, so replaying a
     * request writes nothing twice.
     */
    async logPicks(rows: PickRow[]): Promise<void> {
      for (const r of rows) await bucket.setIfNew(pickKey(r.code, r.at), r);
    },
  };
}
