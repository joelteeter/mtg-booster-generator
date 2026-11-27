/*
 * The only server the draft has: HTTP in, one room operation, JSON out.
 *
 * There are no rules in this file, by design. The draft's rules are in
 * `src/lib/draft`, the room's are in `src/lib/room/ops.ts`, and both are
 * tested in Vitest against a fake store — which is the whole reason this
 * handler is thin enough to read in one go. If logic starts appearing here it
 * belongs in one of those two places instead.
 *
 * No CORS headers: the page that calls this is served from the same Netlify
 * site, so these are same-origin requests. Anything that needed CORS here
 * would be something we did not intend to serve.
 */
import type { Config, Context } from "@netlify/functions";

import { gateOpen, tidyCode } from "../../src/lib/room/codes";
import { STATUS } from "../../src/lib/room/http";
import {
  allDecks,
  createRoom,
  joinRoom,
  makePick,
  newSeatKey,
  readRoom,
  saveDeck,
  startDraft,
  unlockDeck,
} from "../../src/lib/room/ops";
import type { Outcome, Refused } from "../../src/lib/room/ops";
import { blobStore } from "../../src/lib/room/blob-store";
import { netlifyBucket } from "../lib/netlify-bucket";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      /* A draft changes under you; nothing about it may be cached. */
      "cache-control": "no-store",
    },
  });

const refused = (r: Refused): Response =>
  json({ error: r.reason, detail: r.detail }, STATUS[r.reason] ?? 500);

const reply = <T,>(out: Outcome<T>): Response =>
  out.ok ? json(out) : refused(out);

const handler = async (
  req: Request,
  context: Context,
): Promise<Response> => {
  /*
   * Blobs needs no configuration inside a Netlify function — there is no
   * connection string and no provisioning step. It does need the Netlify
   * runtime, so a failure here means this is not running in one, which is a
   * 503: "this deploy cannot serve drafts", not "your request was wrong".
   */
  let store;
  try {
    store = blobStore(netlifyBucket());
  } catch (e) {
    return json({ error: "no-storage", detail: String(e) }, 503);
  }
  const key = req.headers.get("x-draft-key");
  /*
   * A second key, because playing and running the draft are separate facts
   * and whoever started it is usually both. The seat key is the identity;
   * this one only says they may also deal, and hand decks back.
   */
  const adminKey = req.headers.get("x-draft-admin-key");
  const code = tidyCode(context.params.code ?? "");
  const action = (context.params.action ?? "").toLowerCase();
  const body = async (): Promise<unknown> =>
    await req.json().catch(() => null);

  if (!code) {
    if (req.method !== "POST")
      return json({ error: "method-not-allowed" }, 405);
    /*
     * Normally no gate at all: `DRAFT_ADMIN_PASSWORD` is unset and anybody
     * who can reach the site can make a room, which is fine for a site nobody
     * is linking to. Setting it in the Netlify UI turns the gate on without a
     * deploy.
     */
    if (!gateOpen(process.env.DRAFT_ADMIN_PASSWORD, req.headers.get("x-draft-password")))
      return json({ error: "not-admin", detail: "wrong password" }, 403);
    return reply(await createRoom(store, await body()));
  }

  if (!action)
    return req.method === "GET"
      ? reply(await readRoom(store, code, key, adminKey))
      : json({ error: "method-not-allowed" }, 405);

  /* The only GET with a name on it, because it is the only one that is not
   * the room: it is everybody's decks, and only the admin may have it. */
  if (action === "decks")
    return req.method === "GET"
      ? reply(await allDecks(store, code, adminKey ?? key ?? ""))
      : json({ error: "method-not-allowed" }, 405);

  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const sent = (await body() ?? {}) as Record<string, unknown>;
  switch (action) {
    case "join":
      return reply(await joinRoom(store, code, sent.name));
    case "start":
      return reply(
        await startDraft(
          store,
          code,
          adminKey ?? key ?? "",
          sent.packs,
          undefined,
          sent.summary,
        ),
      );
    case "pick":
      return reply(await makePick(store, code, key, sent.packId, sent.cards));
    case "deck":
      return reply(await saveDeck(store, code, key, sent));
    case "unlock":
      return reply(
        await unlockDeck(store, code, adminKey ?? key ?? "", sent.playerId),
      );
    /*
     * Replies with a seat key in the body, which no other route does. It is
     * a POST so it cannot be prefetched or sit in a cache, and the admin key
     * it demands travels in a header rather than the URL.
     */
    case "rekey":
      return reply(
        await newSeatKey(store, code, adminKey ?? key ?? "", sent.playerId),
      );
    default:
      return json({ error: "no-such-action", detail: action }, 404);
  }
};

export default handler;

export const config: Config = {
  path: ["/api/draft", "/api/draft/:code", "/api/draft/:code/:action"],
};
