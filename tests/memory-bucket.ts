/*
 * A `Bucket` in a Map, for testing the revision chain.
 *
 * Two things it is careful about, because they are the two the real thing
 * does and the blob store depends on:
 *
 *  - `setIfNew` really refuses an existing key. That single operation is what
 *    stands in for a transaction, so a fake that overwrote would let every
 *    race test pass and the live draft lose picks.
 *  - values round-trip through JSON, as they would through storage, so
 *    anything that survives here by being the same object in memory fails
 *    here too.
 *
 * `hideFromList` simulates the one way object storage is allowed to lie: a
 * list that has not caught up with a write that is already readable by name.
 */
import type { Bucket } from "@/lib/room";

export class MemoryBucket implements Bucket {
  readonly data = new Map<string, string>();

  /** Keys to leave out of `list`, as a lagging index would. */
  readonly hideFromList = new Set<string>();

  async get(key: string): Promise<unknown> {
    const raw = this.data.get(key);
    return raw === undefined ? null : JSON.parse(raw);
  }

  async setIfNew(key: string, value: unknown): Promise<boolean> {
    if (this.data.has(key)) return false;
    this.data.set(key, JSON.stringify(value));
    return true;
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.data.keys()]
      .filter((k) => k.startsWith(prefix) && !this.hideFromList.has(k))
      .sort();
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  /** Keys under a prefix including hidden ones — for assertions only. */
  keys(prefix: string): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}
