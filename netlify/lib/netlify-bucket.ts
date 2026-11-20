/*
 * `Bucket` on Netlify Blobs. An adapter and nothing else: every decision the
 * draft's storage makes is in `src/lib/room/blob-store.ts`, where it can be
 * tested against a Map.
 *
 * `consistency: "strong"` because the revision chain reads a key it may have
 * written a moment ago, and the default is eventual. The chain also probes
 * forward past the newest listed key, which covers a list that lags even when
 * reads do not — see `PROBE` there.
 */
import { getStore } from "@netlify/blobs";

import type { Bucket } from "../../src/lib/room/bucket";

export function netlifyBucket(name = "drafts"): Bucket {
  const store = getStore({ name, consistency: "strong" });

  return {
    async get(key: string): Promise<unknown> {
      return (await store.get(key, { type: "json" })) ?? null;
    },

    async setIfNew(key: string, value: unknown): Promise<boolean> {
      const { modified } = await store.setJSON(key, value, {
        onlyIfNew: true,
      });
      return modified;
    },

    async set(key: string, value: unknown): Promise<void> {
      await store.setJSON(key, value);
    },

    async list(prefix: string): Promise<string[]> {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key).sort();
    },

    async delete(key: string): Promise<void> {
      await store.delete(key);
    },
  };
}
