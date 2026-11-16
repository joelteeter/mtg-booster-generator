/*
 * A `Store` in a Map, for driving the room operations in Vitest.
 *
 * The point of it is the conditions, not the storage. `putDraft` and `deal`
 * check `rev`, `addPlayer` checks the cap and the name, and `createDraft`
 * refuses a code already taken — because those checks are the whole
 * correctness argument for the Postgres implementation, and a fake that waved
 * them through would let these tests pass while the real thing lost picks.
 *
 * Rows are deep-copied in and out for the same reason: a real database hands
 * back a copy, so an operation that mutated what it read would work here and
 * fail in production.
 */
import type {
  DraftPatch,
  DraftRow,
  JoinOutcome,
  PickRow,
  PlayerRow,
  Store,
} from "@/lib/room";

const copy = <T>(v: T): T => structuredClone(v);

export class MemoryStore implements Store {
  readonly drafts = new Map<string, DraftRow>();
  readonly roster = new Map<string, PlayerRow[]>();
  readonly picks: PickRow[] = [];

  /** Make the next conditional write lose, as if somebody got there first. */
  loseNextWrite = false;
  /** Make `logPicks` throw, to prove a pick stands without its log row. */
  breakLog = false;

  async createDraft(row: DraftRow): Promise<boolean> {
    if (this.drafts.has(row.code)) return false;
    this.drafts.set(row.code, copy(row));
    this.roster.set(row.code, []);
    return true;
  }

  async getDraft(code: string): Promise<DraftRow | null> {
    const row = this.drafts.get(code);
    return row ? copy(row) : null;
  }

  private write(code: string, rev: number, patch: DraftPatch): boolean {
    if (this.loseNextWrite) {
      this.loseNextWrite = false;
      return false;
    }
    const row = this.drafts.get(code);
    if (!row || row.rev !== rev) return false;
    this.drafts.set(code, copy({ ...row, ...patch, rev: rev + 1 }));
    return true;
  }

  async putDraft(
    code: string,
    rev: number,
    patch: DraftPatch,
  ): Promise<boolean> {
    return this.write(code, rev, patch);
  }

  async listPlayers(code: string): Promise<PlayerRow[]> {
    return copy(this.roster.get(code) ?? []);
  }

  async addPlayer(row: PlayerRow, maxSeats: number): Promise<JoinOutcome> {
    const list = this.roster.get(row.code);
    if (!list) return "room-full";
    if (list.length >= maxSeats) return "room-full";
    const same = (a: string, b: string) =>
      a.toLowerCase() === b.toLowerCase();
    if (list.some((p) => same(p.name, row.name))) return "name-taken";
    list.push(copy(row));
    return "joined";
  }

  async logPicks(rows: PickRow[]): Promise<void> {
    if (this.breakLog) throw new Error("the pick log is unavailable");
    this.picks.push(...copy(rows));
  }
}
