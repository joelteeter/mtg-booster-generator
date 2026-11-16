/*
 * The four things the blob store needs from storage.
 *
 * It exists so that the interesting half of `blob-store.ts` — the revision
 * chain, the slot claiming, the name tie-break — is testable against a Map,
 * leaving `netlify/lib/netlify-bucket.ts` as a dozen lines of adapter with no
 * decisions in it.
 */
export interface Bucket {
  /** The value, or null if the key has never been written. */
  get(key: string): Promise<unknown>;
  /**
   * Write only if the key does not exist. True when this call wrote it.
   *
   * Everything rests on this one operation. A key that can only be created
   * once is a compare-and-set, and a compare-and-set is what replaces the
   * transaction that object storage cannot give us.
   */
  setIfNew(key: string, value: unknown): Promise<boolean>;
  /** Every key under a prefix, in lexicographic order. */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}
