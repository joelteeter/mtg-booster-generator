/*
 * A room: a draft with people in it, and the storage it needs.
 *
 * `codes` makes the room code and the seat keys, `types` holds the rows and
 * the one port to storage, `ops` is every operation a request can ask for,
 * `http` says what each refusal means over the wire, and `blob-store` is the
 * port implemented on object storage, which is where a draft actually lives. The draft's rules are not here — they are in `lib/draft`, which knows
 * nothing about rooms. See docs/async-draft.md.
 */
export * from "./blob-store";
export * from "./bucket";
export * from "./codes";
export * from "./http";
export * from "./ops";
export * from "./types";
