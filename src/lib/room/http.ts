/*
 * Which HTTP status each refusal is.
 *
 * A `Record` over the whole union rather than a function with a default, so
 * that adding a refusal without deciding what it means over HTTP is a type
 * error rather than a silent 500 in a month's time.
 */
import type { PickRefusal } from "../draft/types";

import type { RoomRefusal } from "./ops";

export const STATUS: Record<RoomRefusal | PickRefusal, number> = {
  /* The request itself is wrong, and sending it again will not help. */
  "bad-rules": 400,
  "bad-name": 400,
  "bad-pool": 400,
  "bad-pick": 400,

  /* The caller is not who they would need to be. */
  "not-admin": 403,
  "not-a-player": 403,

  "no-such-room": 404,

  /*
   * The room is real but is not in a state where this makes sense. All 409,
   * because every one of them is "the draft moved" rather than "you are
   * wrong" — which is also why the client's answer to most of them is to
   * re-read the room and show what is actually there.
   */
  "wrong-phase": 409,
  "room-full": 409,
  "name-taken": 409,
  "not-enough-players": 409,
  "no-seat": 409,
  "stale-shape": 409,
  "lost-race": 409,
  "draft-over": 409,
  "no-such-pack": 409,
  "not-your-pack": 409,
  "wrong-count": 409,
  "not-in-pack": 409,
  "repeated-card": 409,
};
