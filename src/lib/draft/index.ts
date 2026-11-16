/*
 * The async draft, as rules without a server.
 *
 * `types` writes down the state, `engine` is every rule that acts on it, and
 * `deal` starts one. Nothing here knows about cards, players, storage or the
 * network: the draft is a state machine over opaque card keys, which is what
 * lets it be tested like the rest of the app. See docs/async-draft.md.
 */
export * from "./deal";
export * from "./engine";
export * from "./types";
