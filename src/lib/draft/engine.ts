/*
 * The rules of the draft, as pure functions over `DraftState`.
 *
 * Why these are a file of their own rather than code inside the function that
 * serves a pick: this is the only part of the feature that can be tested the
 * way the rest of the app is tested. The handler loads a state, calls
 * `applyPick`, and stores what comes back — it holds no rules at all.
 *
 * The property worth knowing, and asserted in `tests/draft.test.ts`: with the
 * seat order fixed at the start, **timing cannot change what anybody sees**. A
 * pack's contents on any visit depend only on the seats that saw it earlier,
 * so whether a pick took nine seconds or two days changes when a card is
 * taken and nothing else. That is what lets packs flow freely instead of in
 * lockstep, which is the whole of what makes the draft async.
 */
import type {
  DraftRules,
  DraftState,
  Direction,
  PackState,
  PackStatus,
  Pick,
  PickResult,
  Taken,
} from "./types";

/**
 * Pack 1 left, pack 2 right, pack 3 left — the way a paper draft goes.
 *
 * It used to default the other way round, which was nobody's convention and
 * only ever came from an offhand example. A draft should behave like a draft
 * unless somebody deliberately changes it, which the room's own setting still
 * allows.
 */
export const DEFAULT_PASS: Direction[] = ["left", "right", "left"];

export const packStatus = (pack: PackState): PackStatus =>
  pack.remaining.length === 0
    ? "spent"
    : pack.holder === null
      ? "unopened"
      : "in-play";

export const passDirection = (rules: DraftRules, round: number): Direction =>
  rules.pass[(round - 1) % rules.pass.length] ?? "left";

export const nextSeat = (
  seat: number,
  dir: Direction,
  seats: number,
): number => (dir === "left" ? (seat + 1) % seats : (seat - 1 + seats) % seats);

/** How many cards this visit takes: a turn's worth, or whatever is left. */
export const takeCount = (rules: DraftRules, pack: PackState): number =>
  Math.min(rules.picksPerTurn, pack.remaining.length);

export const isOver = (state: DraftState): boolean =>
  state.round > state.rules.rounds;

/**
 * The packs sitting with a seat, the one that has waited longest first.
 *
 * This is the order to show them in, not an order the engine imposes: a seat
 * may pick from any pack it holds. Forcing the oldest would be a rule about
 * nothing, since a pack still visits the same seats in the same order either
 * way — see the note at the top of this file.
 */
export function queueFor(state: DraftState, seat: number): PackState[] {
  return state.packs
    .filter((p) => p.holder === seat && p.remaining.length > 0)
    .sort((a, b) => a.arrived - b.arrived || a.id.localeCompare(b.id));
}

/**
 * Seats holding at least one pack, the one that has kept a pack longest
 * first. This is the admin's "who is holding it up" list.
 */
export function waitingOn(state: DraftState): number[] {
  const oldest = new Map<number, number>();
  for (const p of state.packs) {
    if (p.holder === null || p.remaining.length === 0) continue;
    const seen = oldest.get(p.holder);
    if (seen === undefined || p.arrived < seen) oldest.set(p.holder, p.arrived);
  }
  return Array.from(oldest.entries())
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([seat]) => seat);
}

/** Put a round's packs in front of the seats that open them. */
const openRound = (
  packs: PackState[],
  round: number,
  clock: number,
): PackState[] =>
  packs.map((p) =>
    p.round === round ? { ...p, holder: p.openedBy, arrived: clock } : p,
  );

/**
 * Take cards from a pack and pass it on, or retire it if that emptied it.
 *
 * The state that comes back is a new object; nothing is mutated, so a caller
 * can keep the old one — which is what makes a refused pick cost nothing and
 * a replay from a snapshot possible.
 */
export function applyPick(state: DraftState, pick: Pick): PickResult {
  if (isOver(state)) return { ok: false, reason: "draft-over" };

  const pack = state.packs.find((p) => p.id === pick.packId);
  if (!pack) return { ok: false, reason: "no-such-pack" };

  /*
   * One refusal covers three cases deliberately — somebody else's pack, a
   * pack that is spent, and a pack whose round has not opened — because from
   * the picker's side they are the same thing: the pack on the page is not
   * there any more.
   */
  if (pack.holder !== pick.seat || pack.remaining.length === 0)
    return { ok: false, reason: "not-your-pack" };

  if (pick.cards.length !== takeCount(state.rules, pack))
    return { ok: false, reason: "wrong-count" };
  if (new Set(pick.cards).size !== pick.cards.length)
    return { ok: false, reason: "repeated-card" };
  if (pick.cards.some((c) => !pack.remaining.includes(c)))
    return { ok: false, reason: "not-in-pack" };

  const clock = state.clock + 1;
  const left = pack.remaining.filter((c) => !pick.cards.includes(c));
  const moved: PackState = {
    ...pack,
    remaining: left,
    seen: [...pack.seen, pick.seat],
    holder: left.length
      ? nextSeat(
          pick.seat,
          passDirection(state.rules, pack.round),
          state.rules.seats,
        )
      : null,
    arrived: clock,
  };

  const taken: Taken[] = pick.cards.map((card) => ({
    card,
    packId: pack.id,
    round: pack.round,
    at: clock,
  }));

  let packs = state.packs.map((p) => (p.id === pack.id ? moved : p));
  const picked = state.picked.map((forSeat, seat) =>
    seat === pick.seat ? [...forSeat, ...taken] : forSeat,
  );

  /*
   * A round ends only when every one of its packs is empty, and nobody opens
   * the next one early. This is the one place the draft waits for the slowest
   * player, and it has to: opening pack 2 ahead of the table would be
   * drafting against information nobody else has yet.
   */
  let round = state.round;
  if (packs.every((p) => p.round !== round || p.remaining.length === 0)) {
    round += 1;
    if (round <= state.rules.rounds) packs = openRound(packs, round, clock);
  }

  return { ok: true, state: { ...state, round, packs, picked, clock }, taken };
}
