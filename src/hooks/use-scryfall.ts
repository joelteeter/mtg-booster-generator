"use client";

/*
 * The app's Scryfall instance, and the queries over it.
 *
 * One client means one shared request queue for the whole page, which is the
 * point of it — see lib/scryfall/client.ts.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { createScryfallClient } from "@/lib/scryfall/client";
import { createScryfallPools } from "@/lib/scryfall/pools";
import { scryfallQueries } from "@/lib/scryfall/queries";
import type { ScryfallSet } from "@/lib/scryfall/types";

export const client = createScryfallClient({
  // The old code wrote these into #status; a toast is the shadcn equivalent.
  onNotice: (message) => toast.warning(message, { duration: 12000 }),
});

export const pools = createScryfallPools(client);

export const queries = scryfallQueries({
  pools,
  getSets: () => client.getSets(),
  searchCards: (query, unique, signal) =>
    client.search(query, { unique, signal }),
});

/** Every set Scryfall knows about. Loaded once. */
export function useSets() {
  return useQuery(queries.sets());
}

/**
 * Set metadata by code, for every set — not just the pickable ones. The old
 * `initSetList` filled the same lookup from the same request.
 */
export function useSetsByCode(): Map<string, ScryfallSet> {
  const { data } = useSets();
  return useMemo(() => {
    const map = new Map<string, ScryfallSet>();
    for (const s of data ?? []) map.set(s.code, s);
    return map;
  }, [data]);
}
