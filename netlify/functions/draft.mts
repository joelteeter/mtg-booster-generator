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

import { tidyCode } from "../../src/lib/room/codes";
import { STATUS } from "../../src/lib/room/http";
import {
  createRoom,
  joinRoom,
  makePick,
  readRoom,
  startDraft,
} from "../../src/lib/room/ops";
import type { Outcome, Refused } from "../../src/lib/room/ops";
import { neonStore } from "../lib/neon-store";

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
   * `NETLIFY_DB_URL` is the name the docs give, and the one to rely on.
   * `NETLIFY_DATABASE_URL` is what the earlier incarnation of Netlify DB set
   * and may still be what `netlify database init` leaves behind; `DATABASE_URL`
   * is for pointing a local run at something by hand. Three names for one
   * value is not elegant, but a draft failing because the platform renamed its
   * variable is worse.
   *
   * `@netlify/database` exposes `getConnectionString()` and is the documented
   * alternative. Not used, so that this function depends on the driver and
   * nothing else.
   */
  const url =
    process.env.NETLIFY_DB_URL ??
    process.env.NETLIFY_DATABASE_URL ??
    process.env.DATABASE_URL;
  /*
   * A deploy context with no database is a configuration mistake, not a
   * request error — 503 says "this deploy cannot serve drafts", which is what
   * a branch deploy that has not been given one should say.
   */
  if (!url) return json({ error: "no-database" }, 503);

  const store = neonStore(url);
  const key = req.headers.get("x-draft-key");
  const code = tidyCode(context.params.code ?? "");
  const action = (context.params.action ?? "").toLowerCase();
  const body = async (): Promise<unknown> =>
    await req.json().catch(() => null);

  if (!code)
    return req.method === "POST"
      ? reply(await createRoom(store, await body()))
      : json({ error: "method-not-allowed" }, 405);

  if (!action)
    return req.method === "GET"
      ? reply(await readRoom(store, code, key))
      : json({ error: "method-not-allowed" }, 405);

  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const sent = (await body() ?? {}) as Record<string, unknown>;
  switch (action) {
    case "join":
      return reply(await joinRoom(store, code, sent.name));
    case "start":
      return reply(await startDraft(store, code, key ?? "", sent.packs));
    case "pick":
      return reply(await makePick(store, code, key, sent.packId, sent.cards));
    default:
      return json({ error: "no-such-action", detail: action }, 404);
  }
};

export default handler;

export const config: Config = {
  path: ["/api/draft", "/api/draft/:code", "/api/draft/:code/:action"],
};
