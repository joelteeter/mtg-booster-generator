/*
 * Planechase and Archenemy: the rules, the prose and the deck mechanics.
 *
 * Ported from `js/simulators.js`, which was one IIFE holding its own state and
 * writing HTML into `#simUI`. The state lives in `store/sims.ts` now and the
 * markup is React; what is left here is the part worth testing — the two
 * configurations, the card predicates, the shuffle, the planar die, and every
 * string the user reads.
 *
 * The deck functions take a state and return the next one, so a sequence of
 * planeswalks is a plain list of calls in a test rather than a sequence of
 * clicks in a browser.
 */
import type { Card } from "@/lib/scryfall/types";

export type SimKind = "planechase" | "archenemy";

export interface SimConfig {
  /** The Scryfall search, run once per simulator with `unique:cards`. */
  query: string;
  noun: string;
  drawLabel: string;
  blurb: string;
  /** Planes are printed sideways, so they are shown rotated by default. */
  landscape: boolean;
}

export const SIMS: Record<SimKind, SimConfig> = {
  planechase: {
    query: "layout:planar game:paper",
    noun: "plane",
    drawLabel: "🌀 Planeswalk",
    blurb:
      "Shuffle every Plane on Scryfall — and every Phenomenon, unless you switch them off below — into one planar deck. Planeswalk to reveal the next plane; the plane you leave goes to the bottom of the deck. Roll the planar die on your turn; each extra roll in the same turn costs one more generic mana.",
    landscape: true,
  },
  archenemy: {
    query: "layout:scheme game:paper",
    noun: "scheme",
    drawLabel: "😈 Set a scheme in motion",
    blurb:
      "Shuffle every Scheme on Scryfall into one scheme deck. Each time you set a scheme in motion, the previous non-ongoing scheme goes to the bottom of the deck. Ongoing schemes stay in play until you abandon them.",
    landscape: false,
  },
};

export const isPhenomenon = (c: Card): boolean =>
  /Phenomenon/.test(c.type_line || "");

export const isOngoing = (c: Card): boolean => /Ongoing/.test(c.type_line || "");

export function imageOf(card: Card, size: "small" | "normal" | "large"): string {
  if (card.image_uris) return card.image_uris[size] || "";
  if (card.card_faces && card.card_faces[0].image_uris)
    return card.card_faces[0].image_uris[size] || "";
  return "";
}

/** An integer in [0, n). Injected so a shuffle can be made deterministic. */
export type IndexRng = (n: number) => number;

/**
 * Uniform random index, from the Web Crypto API when it is there.
 *
 * The rejection loop matters: `crypto.getRandomValues()[0] % n` is biased
 * towards the low indices unless the values at the top of the 32-bit range
 * that do not divide evenly are thrown away.
 */
export const cryptoIndex: IndexRng = (n) => {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    let x: number;
    do {
      c.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % n;
  }
  return Math.floor(Math.random() * n);
};

/** Fisher–Yates, leaving the input alone. */
export function shuffle<T>(arr: T[], rnd: IndexRng = cryptoIndex): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------------
// The planar die: 1 planeswalk face, 1 chaos face, 4 blank faces
// ------------------------------------------------------------------
export interface DieFace {
  face: "planeswalk" | "chaos" | "blank";
  icon: string;
  label: string;
  note: string;
}

export const DIE: DieFace[] = [
  {
    face: "planeswalk",
    icon: "🌀",
    label: "Planeswalk!",
    note: "Planeswalk to the next plane.",
  },
  {
    face: "chaos",
    icon: "✺",
    label: "Chaos!",
    note: "Trigger the current plane's chaos ability.",
  },
  { face: "blank", icon: "", label: "Blank", note: "Nothing happens." },
  { face: "blank", icon: "", label: "Blank", note: "Nothing happens." },
  { face: "blank", icon: "", label: "Blank", note: "Nothing happens." },
  { face: "blank", icon: "", label: "Blank", note: "Nothing happens." },
];

export const rollDie = (rnd: IndexRng = cryptoIndex): DieFace => DIE[rnd(6)];

/** Each extra roll in the same turn costs one more generic mana. */
export const nextCostText = (rolls: number): string =>
  rolls === 0
    ? "Next roll this turn: free"
    : `Rolls this turn: ${rolls} · next roll costs {${rolls}}`;

// ------------------------------------------------------------------
// Deck state
// ------------------------------------------------------------------
export interface SimState {
  deck: Card[];
  current: Card | null;
  /** Most recent first, including the current card. */
  history: Card[];
  ongoing: Card[];
  rolls: number;
  die: DieFace | null;
  /** Planes only: show the scan as printed rather than rotated. */
  rotated: boolean;
}

export const emptySimState = (): SimState => ({
  deck: [],
  current: null,
  history: [],
  ongoing: [],
  rolls: 0,
  die: null,
  rotated: false,
});

/** A step's result. No `message` means "say whatever the state implies". */
export interface SimStep {
  state: SimState;
  message?: string;
}

export interface ShuffleParams {
  kind: SimKind;
  pool: Card[];
  /** Planechase only. Phenomena are in the deck unless switched off. */
  includePhenomena: boolean;
  rnd?: IndexRng;
}

export function shuffleDeck(
  state: SimState,
  { kind, pool, includePhenomena, rnd }: ShuffleParams,
): SimStep {
  const cards =
    kind === "planechase" && !includePhenomena
      ? pool.filter((c) => !isPhenomenon(c))
      : pool;
  const deck = shuffle(cards, rnd);
  return {
    state: { ...emptySimState(), rotated: state.rotated, deck },
    message: `🔀 Shuffled ${deck.length} ${SIMS[kind].noun}s into a new deck.`,
  };
}

/**
 * Planeswalk, or set a scheme in motion.
 *
 * The card being left goes to the bottom of the deck — except an ongoing
 * scheme, which stays in play, which is how the scheme deck can run dry.
 */
export function drawNext(state: SimState, kind: SimKind): SimStep | null {
  if (!state.deck.length && !state.current) return null;
  const deck = state.deck.slice();
  if (state.current && !(kind === "archenemy" && isOngoing(state.current)))
    deck.push(state.current);
  const current = deck.shift() ?? null;
  if (!current)
    return {
      state: { ...state, deck, current: null },
      message:
        "The deck is empty: every scheme is ongoing. Abandon one to continue.",
    };
  const ongoing =
    kind === "archenemy" && isOngoing(current)
      ? [...state.ongoing, current]
      : state.ongoing;
  return {
    state: {
      ...state,
      deck,
      current,
      ongoing,
      history: [current, ...state.history],
      // A new plane clears the die; the roll count belongs to the turn.
      die: kind === "planechase" ? null : state.die,
    },
  };
}

/** Archenemy only: give up an ongoing scheme, sending it to the bottom. */
export function abandonAt(state: SimState, index: number): SimStep | null {
  const card = state.ongoing[index];
  if (!card) return null;
  const ongoing = state.ongoing.filter((_, i) => i !== index);
  return {
    state: {
      ...state,
      ongoing,
      deck: [...state.deck, card],
      current: state.current === card ? null : state.current,
    },
    message: `Abandoned ${card.name}; it goes to the bottom of the scheme deck.`,
  };
}

export function newTurn(state: SimState): SimStep {
  return {
    state: { ...state, rolls: 0, die: null },
    message: "New turn: your next planar die roll is free.",
  };
}

// ------------------------------------------------------------------
// Wording
// ------------------------------------------------------------------
export const loadingText = (kind: SimKind): string =>
  `Loading every ${SIMS[kind].noun} from Scryfall…`;

export const loadErrorText = (message: string): string =>
  `❌ Could not load cards: ${message}`;

/** The line under the controls, when no action has supplied its own. */
export function derivedStatus(
  state: SimState,
  kind: SimKind,
  poolSize: number,
): string {
  const { noun } = SIMS[kind];
  if (state.current)
    return `${state.deck.length} ${noun}s left in the deck · ${state.history.length} revealed so far`;
  if (state.deck.length)
    return (
      `Deck ready: ${state.deck.length} ${noun}s. ` +
      (kind === "planechase"
        ? "Planeswalk to reveal your starting plane."
        : "Set your first scheme in motion.")
    );
  return `${poolSize} ${noun}s available. Press Shuffle to build the deck.`;
}

/** What the card area says before anything has been revealed. */
export const emptyBoardText = (state: SimState, kind: SimKind): string =>
  state.deck.length
    ? "Deck shuffled. " +
      (kind === "planechase" ? "Planeswalk" : "Set a scheme in motion") +
      " to reveal a card."
    : "Shuffle to start.";

/** The note under the current card, when it needs one. */
export function cardNote(card: Card, kind: SimKind): string {
  if (kind === "planechase" && isPhenomenon(card))
    return "Phenomenon: resolve its effect, then planeswalk again.";
  if (kind === "archenemy" && isOngoing(card))
    return "Ongoing scheme: stays in play until you abandon it.";
  return "";
}

export const rotateLabel = (rotated: boolean): string =>
  `↻ ${rotated ? "Show landscape" : "Show as scanned (portrait)"}`;
