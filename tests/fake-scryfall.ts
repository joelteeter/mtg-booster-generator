/*
 * A fake Scryfall, keyed on the exact query text.
 *
 * It does not implement Scryfall's search language — it matches queries
 * literally. That is the point: if the port issues a query even slightly
 * different from the old code's, the fake does not recognise it and the test
 * says so, rather than quietly returning plausible cards. Every parity test
 * asserts that both implementations asked for exactly the same things.
 */
import type { Card, ScryfallSet, SearchPage } from "@/lib/scryfall/types";

export interface FakeOptions {
  /** Decoded `q` (including any `unique:` suffix) to the cards it returns. */
  search?: Record<string, Card[]>;
  /** Set code to its metadata, for `/sets/<code>`. */
  sets?: Record<string, ScryfallSet>;
  /** The `/sets` listing. */
  setList?: ScryfallSet[];
  /** Cards per page, to exercise `next_page`. Default is one page. */
  pageSize?: number;
  /** Decoded `q` to the card `/cards/random` returns. */
  random?: Record<string, Card>;
  /**
   * Responses to serve before the real one, by URL substring — used to test
   * 429 handling and network failures. Each entry is consumed once.
   */
  failures?: Array<
    | { kind: "status"; status: number; headers?: Record<string, string> }
    | { kind: "network" }
  >;
}

export interface FakeScryfall {
  fetch: typeof globalThis.fetch;
  /** Every decoded query asked for, in order, including repeats. */
  queries: string[];
  /** Queries the fake did not recognise. Should always be empty. */
  unknown: string[];
  /** Non-search URLs requested, e.g. "sets/dsk". */
  paths: string[];
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

export function fakeScryfall(options: FakeOptions = {}): FakeScryfall {
  const search = options.search ?? {};
  const pageSize = options.pageSize ?? 1000;
  const queries: string[] = [];
  const unknown: string[] = [];
  const paths: string[] = [];
  const failures = [...(options.failures ?? [])];

  const fetch = (async (input: RequestInfo | URL) => {
    const href = typeof input === "string" ? input : String(input);

    const failure = failures.shift();
    if (failure) {
      if (failure.kind === "network") throw new TypeError("Failed to fetch");
      return json({ error: "forced" }, failure.status, failure.headers);
    }

    const url = new URL(href);
    const path = url.pathname.replace(/^\//, "");

    if (path === "cards/search") {
      const q = url.searchParams.get("q") ?? "";
      const page = parseInt(url.searchParams.get("page") ?? "1", 10);
      if (page === 1) queries.push(q);
      const cards = search[q];
      if (!cards) {
        if (page === 1) unknown.push(q);
        // Scryfall 404s a search that matches nothing.
        return json({ object: "error", status: 404 }, 404);
      }
      const start = (page - 1) * pageSize;
      const slice = cards.slice(start, start + pageSize);
      const hasMore = start + pageSize < cards.length;
      const next = new URL(href);
      next.searchParams.set("page", String(page + 1));
      const body: SearchPage = {
        object: "list",
        total_cards: cards.length,
        has_more: hasMore,
        next_page: hasMore ? next.toString() : undefined,
        data: slice,
      };
      return json(body);
    }

    if (path === "cards/random") {
      const q = url.searchParams.get("q") ?? "";
      queries.push(q);
      const card = options.random?.[q];
      if (!card) {
        unknown.push(q);
        return json({ object: "error", status: 404 }, 404);
      }
      return json(card);
    }

    paths.push(path);

    if (path === "sets") return json({ object: "list", data: options.setList ?? [] });

    const setMatch = /^sets\/(.+)$/.exec(path);
    if (setMatch) {
      const set = options.sets?.[setMatch[1]];
      if (!set) return json({ object: "error", status: 404 }, 404);
      return json(set);
    }

    return json({ object: "error", status: 404 }, 404);
  }) as typeof globalThis.fetch;

  return { fetch, queries, unknown, paths };
}

/** Pool queries get `unique:prints` appended, so fixtures must key on that. */
export const poolQuery = (q: string): string => `${q} unique:prints`;

let seq = 0;

/**
 * Starts card ids again from one.
 *
 * Ids are what `normPools` compares printings by, so a golden recorded for one
 * case only matches if that case builds its cards from the same starting
 * point. Each recorded case resets first.
 */
export function resetCardIds(): void {
  seq = 0;
}

/** A card with just enough fields, and a stable id for comparison. */
export function card(partial: Partial<Card> = {}): Card {
  seq += 1;
  return {
    id: `card-${seq}`,
    name: partial.name ?? `Card ${seq}`,
    rarity: "common",
    type_line: "Creature — Test",
    ...partial,
  } as Card;
}

/**
 * Pools compare as sorted name → sorted printing ids.
 *
 * Takes `object` rather than `Record<string, unknown>` so the typed `PlayPools`
 * and `CommanderPools` interfaces can be passed directly: TypeScript gives an
 * implicit index signature to type aliases but not to interfaces.
 */
export function normPools(pools: object): unknown {
  const bag = pools as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(bag).sort()) {
    const v = bag[key];
    if (v instanceof Map) {
      out[key] = Array.from(v.entries())
        .map(([name, cards]) => [
          name,
          (cards as Card[]).map((c) => c.id).sort(),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    } else {
      out[key] = v;
    }
  }
  return out;
}
