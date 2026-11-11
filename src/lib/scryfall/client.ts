/*
 * Scryfall access: one shared request queue, retries on 429, paginated search.
 *
 * The queue is the part that matters and the part TanStack Query cannot do.
 * Scryfall asks for no more than about ten requests a second averaged, and a
 * single pack generation fans out into a dozen searches, so every request in
 * the app — pools, set list, simulators, The List — waits its turn in one
 * global line. TanStack Query sits above this and handles caching and deduping;
 * this sits underneath and handles politeness.
 *
 * Ported from `js/scryfall.js` with the timing behaviour intact. The one real
 * change: the old `rateLimitNotice` wrote straight into two known DOM elements,
 * which is why this file could not be tested. It is now an injected callback,
 * so the client is pure with respect to the UI and phase 3 can route it to a
 * toast.
 */
import type {
  Card,
  ScryfallSet,
  SearchPage,
  SetListResponse,
  UniqueMode,
} from "./types";

export const API = "https://api.scryfall.com/";

/*
 * Only CORS-safelisted headers: a custom User-Agent makes the browser send an
 * extra OPTIONS preflight before every request, doubling the load on Scryfall.
 * The browser sends its own User-Agent anyway.
 */
const HEADERS: Record<string, string> = { Accept: "application/json" };

/** ≈6–7 requests/second; Scryfall asks for ≤10/s on average. */
export const REQUEST_GAP_MS = 150;
export const MAX_RETRIES = 3;

export interface ScryfallClientOptions {
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Injectable clock, so queue timing can be asserted without waiting. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Called when Scryfall asks us to slow down or does not answer. The old code
   * wrote to `#status` and `#simStatus` directly; phase 3 routes this to a
   * toast instead.
   */
  onNotice?: (message: string) => void;
  requestGapMs?: number;
  maxRetries?: number;
}

export interface SearchOptions {
  /** Appended to the query as `unique:<mode>`. */
  unique?: UniqueMode;
  /**
   * Abandons the search, including any pages still to come.
   *
   * TanStack Query hands one to every `queryFn` and aborts it when nobody is
   * waiting for the answer any more. Choosing a different set while the last
   * one is still loading used to leave a dozen searches in the queue that
   * nothing would read — and they were a large part of what made Scryfall
   * start answering 429.
   */
  signal?: AbortSignal;
  /**
   * Treat 404 as an empty result rather than an error. Scryfall 404s a search
   * that matches nothing, so a set with no token set degrades to no tokens
   * instead of throwing.
   */
  emptyOn404?: boolean;
}

export interface ScryfallClient {
  /** A single request, queued and retried. Returns the raw Response. */
  request(url: string, signal?: AbortSignal): Promise<Response>;
  /** Every card matching a query, following `next_page` to the end. */
  search(query: string, options?: SearchOptions): Promise<Card[]>;
  /** Every printing of every match — the pool loaders' default. */
  fetchPool(query: string, signal?: AbortSignal): Promise<Card[]>;
  /** One random card matching a query. */
  fetchRandom(query: string): Promise<Card>;
  /** Every set Scryfall knows about. */
  getSets(signal?: AbortSignal): Promise<ScryfallSet[]>;
  /** One set's metadata, or null if it cannot be fetched. */
  getSet(code: string, signal?: AbortSignal): Promise<ScryfallSet | null>;
}

/** An abandoned request, which must not be retried or reported as a failure. */
const isAbort = (e: unknown): boolean =>
  e instanceof Error && e.name === "AbortError";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scryfall could not be reached at all: rate-limited, or the network is down.
 *
 * Worth its own type because it is the opposite of an empty answer, and the
 * two call for opposite responses. "This set has no `is:booster` data" is an
 * answer, and the loaders are right to carry on without it. "We never got to
 * ask" is not, and carrying on builds the pack out of pools that are quietly
 * missing a filter.
 *
 * A rate-limited 429 reaches the browser as a bare network error, because
 * Scryfall's 429 carries no `Access-Control-Allow-Origin` and the browser
 * refuses to show us the response. So the two cases cannot be told apart from
 * in here, and both arrive as this.
 */
export class ScryfallUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScryfallUnavailableError";
  }
}

/**
 * Swallow a failed query and carry on with nothing. Used for the searches that
 * are allowed to come back empty — `is:booster` data a set may not have yet,
 * the Prismatic Piper, etched legends.
 *
 * Not for an unreachable Scryfall. `fetchPool` already turns "nothing matched"
 * into an empty list without throwing (`emptyOn404`), so anything that gets
 * here is a real failure — and swallowing the rate-limited one is how a
 * dropped `is:booster` query silently becomes a pack built from the precon
 * cards it was meant to filter out.
 */
export function optional(p: Promise<Card[]>): Promise<Card[]> {
  return p.catch((e: unknown) => {
    if (e instanceof ScryfallUnavailableError || isAbort(e)) throw e;
    console.warn(
      "Optional query failed:",
      e instanceof Error ? e.message : String(e),
    );
    return [];
  });
}

export function createScryfallClient(
  options: ScryfallClientOptions = {},
): ScryfallClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const notice = options.onNotice ?? ((m: string) => console.warn(m));
  const gap = options.requestGapMs ?? REQUEST_GAP_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  /** The next instant a request may go out. Shared by every caller. */
  let nextSlot = 0;

  /** Claim the next slot in the queue, optionally after a backoff. */
  function takeTurn(extraDelayMs = 0): Promise<void> {
    const t = now();
    const at = Math.max(t, nextSlot) + extraDelayMs;
    nextSlot = at + gap;
    return at > t ? sleep(at - t) : Promise.resolve();
  }

  async function request(
    url: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    let backoff = 0;
    for (let attempt = 0; ; attempt++) {
      await takeTurn(backoff);
      let res: Response;
      // Checked after the wait as well as inside `fetch`: a request that was
      // abandoned while queued should never go out at all.
      signal?.throwIfAborted();
      try {
        res = await doFetch(url, { method: "GET", headers: HEADERS, signal });
      } catch (e) {
        if (isAbort(e)) throw e;
        /*
         * A 429 without CORS headers reaches the browser as a plain network
         * error, indistinguishable from being offline, so both are treated as
         * "slow down" and retried.
         */
        if (attempt >= maxRetries)
          throw new ScryfallUnavailableError(
            "Couldn't reach Scryfall (network error or rate limit). Wait a minute and try again.",
          );
        backoff = 10000 * (attempt + 1);
        notice(
          `⏳ Scryfall didn't answer; trying again in ${backoff / 1000}s…`,
        );
        continue;
      }
      if (res.status !== 429) return res;
      if (attempt >= maxRetries)
        throw new ScryfallUnavailableError(
          "Scryfall is rate-limiting requests (429). Wait a minute and try again.",
        );
      const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "");
      const hold = (Number.isFinite(retryAfter) ? retryAfter : 10) * 1000 + 500;
      /*
       * Hold the whole queue, not just this request, so the dozen other
       * searches already in line do not each walk into the same limit.
       */
      nextSlot = Math.max(nextSlot, now() + hold);
      notice(
        `⏳ Scryfall asked us to slow down; continuing in ${Math.ceil(hold / 1000)}s…`,
      );
      // The queue hold above already covers the wait, so the per-request
      // backoff goes back to zero rather than being applied twice.
      backoff = 0;
    }
  }

  async function search(
    query: string,
    { unique, emptyOn404 = false, signal }: SearchOptions = {},
  ): Promise<Card[]> {
    const q = unique ? `${query} unique:${unique}` : query;
    let url: string | null = API + "cards/search?q=" + encodeURIComponent(q);
    const out: Card[] = [];
    while (url) {
      const response = await request(url, signal);
      if (!response.ok) {
        if (emptyOn404 && response.status === 404) return out;
        throw new Error(`Scryfall API Error: ${response.status}`);
      }
      const data = (await response.json()) as SearchPage;
      out.push(...data.data);
      url = data.has_more ? (data.next_page ?? null) : null;
    }
    return out;
  }

  /*
   * `unique:prints` returns every art variant, and `next_page` is followed so
   * a big set is not cut off at Scryfall's 175-card page.
   */
  const fetchPool = (query: string, signal?: AbortSignal): Promise<Card[]> =>
    search(query, { unique: "prints", emptyOn404: true, signal });

  async function fetchRandom(query: string): Promise<Card> {
    const res = await request(
      API + "cards/random?q=" + encodeURIComponent(query),
    );
    if (!res.ok) throw new Error(`Scryfall API Error: ${res.status}`);
    return (await res.json()) as Card;
  }

  async function getSets(signal?: AbortSignal): Promise<ScryfallSet[]> {
    const res = await request(API + "sets", signal);
    if (!res.ok) throw new Error(`Scryfall API Error: ${res.status}`);
    const data = (await res.json()) as SetListResponse;
    return data.data;
  }

  async function getSet(
    code: string,
    signal?: AbortSignal,
  ): Promise<ScryfallSet | null> {
    try {
      const res = await request(API + "sets/" + code, signal);
      if (res.ok) return (await res.json()) as ScryfallSet;
    } catch (e) {
      if (isAbort(e)) throw e;
      /*
       * A missing or misspelled set code answers with a 404 and lands on the
       * `return null` below, which is the case this tolerance is for. Being
       * unable to reach Scryfall is not that: the release date decides
       * whether slot 7 can be a List card, so guessing `null` would quietly
       * change the pack.
       */
      if (e instanceof ScryfallUnavailableError) throw e;
      /* set metadata is not fatal: the pools still load without it */
    }
    return null;
  }

  return { request, search, fetchPool, fetchRandom, getSets, getSet };
}

/** The app's client. Tests build their own with a stubbed fetch and clock. */
export const scryfall = createScryfallClient();
