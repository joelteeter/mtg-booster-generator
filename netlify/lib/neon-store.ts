/*
 * The `Store` port on Netlify DB (Neon Postgres over HTTP).
 *
 * Every method is one statement, which is not tidiness but the correctness
 * argument: `putDraft` is safe because the `rev` check and the write are the
 * same statement, and `addPlayer` is safe because the seat count and the
 * insert are. Anything that read first and wrote after would be a race.
 *
 * The HTTP driver is used rather than a pooled connection because a function
 * invocation is one request: there is no connection to keep and nothing to
 * pool. The one thing it costs is interactive transactions, which is why the
 * schema is arranged so that nothing here needs one.
 */
import { neon } from "@neondatabase/serverless";

import type {
  DraftPatch,
  DraftRow,
  JoinOutcome,
  PickRow,
  PlayerRow,
  Store,
} from "../../src/lib/room/types";

type Row = Record<string, unknown>;

/** Postgres gives back jsonb already parsed; the casts say what it is. */
const asDraft = (r: Row): DraftRow =>
  ({
    code: r.code,
    phase: r.phase,
    shape: Number(r.shape),
    rev: Number(r.rev),
    rules: r.rules,
    pool: r.pool ?? {},
    state: r.state ?? null,
    seats: r.seats ?? {},
    adminHash: r.admin_hash,
    maxSeats: Number(r.max_seats),
    printBasics: r.print_basics === true,
    createdAt: String(r.created_at),
  }) as DraftRow;

const asPlayer = (r: Row): PlayerRow => ({
  code: String(r.code),
  id: String(r.id),
  name: String(r.name),
  keyHash: String(r.key_hash),
  joinedAt: String(r.joined_at),
});

/** jsonb wants text; `null` means "leave this column alone". */
const doc = (v: unknown): string | null =>
  v === undefined ? null : JSON.stringify(v);

export function neonStore(url: string): Store {
  const sql = neon(url);

  return {
    async createDraft(row: DraftRow): Promise<boolean> {
      const done = await sql`
        insert into draft (
          code, created_at, phase, shape, rev, rules, pool, state, seats,
          admin_hash, max_seats, print_basics
        ) values (
          ${row.code}, ${row.createdAt}, ${row.phase}, ${row.shape}, ${row.rev},
          ${doc(row.rules)}::jsonb, ${doc(row.pool)}::jsonb,
          ${doc(row.state)}::jsonb, ${doc(row.seats)}::jsonb,
          ${row.adminHash}, ${row.maxSeats}, ${row.printBasics}
        )
        on conflict (code) do nothing
        returning code`;
      return done.length > 0;
    },

    async getDraft(code: string): Promise<DraftRow | null> {
      const rows = await sql`select * from draft where code = ${code}`;
      return rows.length ? asDraft(rows[0] as Row) : null;
    },

    /*
     * `coalesce` over each column rather than a SET clause built from the
     * patch: dynamic SQL for the sake of skipping four untouched columns is a
     * poor trade, and this way the statement is a constant that can be read.
     *
     * No patch ever sets `state` back to null — only the deal writes it, and
     * it writes a state — so coalesce is the right shape for it too.
     */
    async putDraft(
      code: string,
      rev: number,
      patch: DraftPatch,
    ): Promise<boolean> {
      const done = await sql`
        update draft set
          phase        = coalesce(${patch.phase ?? null}, phase),
          rules        = coalesce(${doc(patch.rules)}::jsonb, rules),
          pool         = coalesce(${doc(patch.pool)}::jsonb, pool),
          state        = coalesce(${doc(patch.state)}::jsonb, state),
          seats        = coalesce(${doc(patch.seats)}::jsonb, seats),
          print_basics = coalesce(${patch.printBasics ?? null}, print_basics),
          rev          = rev + 1
        where code = ${code} and rev = ${rev}
        returning code`;
      return done.length > 0;
    },

    async listPlayers(code: string): Promise<PlayerRow[]> {
      const rows = await sql`
        select * from player where code = ${code}
        order by joined_at, id`;
      return rows.map((r) => asPlayer(r as Row));
    },

    /*
     * The cap and the insert are one statement, so two people cannot both take
     * the last seat, and the unique index on the name settles two people
     * arriving as "Dev". Working out *which* of the two happened needs a second
     * look, and that one is allowed to be racy: it only decides the wording.
     *
     * The port passes a `maxSeats` which this ignores on purpose — the number
     * in the row is the one the insert has to agree with, and reading it from
     * the argument instead would be trusting a value that travelled.
     */
    async addPlayer(row: PlayerRow): Promise<JoinOutcome> {
      const done = await sql`
        insert into player (code, id, name, key_hash, joined_at)
        select ${row.code}, ${row.id}, ${row.name}, ${row.keyHash},
               ${row.joinedAt}
        where (select count(*) from player where code = ${row.code})
            < (select max_seats from draft where code = ${row.code})
        on conflict do nothing
        returning id`;
      if (done.length > 0) return "joined";

      const taken = await sql`
        select 1 from player
        where code = ${row.code} and lower(name) = lower(${row.name})`;
      return taken.length > 0 ? "name-taken" : "room-full";
    },

    /*
     * One row at a time. A pick is at most two cards and a request makes one
     * pick, so the loop runs once; `on conflict do nothing` makes a retry of
     * the whole request harmless rather than a duplicate log row.
     */
    async logPicks(rows: PickRow[]): Promise<void> {
      for (const r of rows)
        await sql`
          insert into pick (code, at, seat, pack_id, cards)
          values (${r.code}, ${r.at}, ${r.seat}, ${r.packId}, ${r.cards})
          on conflict (code, at) do nothing`;
    },
  };
}
