/*
 * The Planechase and Archenemy simulators, old against new.
 *
 * Three things are compared. The configurations, because they are three
 * paragraphs of rules text that a port can silently reword. The pure helpers,
 * including the shuffle, which has to consume randomness in the same order to
 * deal the same deck. And the deck mechanics, driven as a scripted sequence of
 * the same actions the buttons fire, comparing the deck, the current card, the
 * history, the ongoing schemes and the status line after every step.
 */
import { describe, expect, it } from "vitest";

import {
  DIE,
  SIMS,
  abandonAt,
  derivedStatus,
  drawNext,
  emptySimState,
  imageOf,
  isOngoing,
  isPhenomenon,
  newTurn,
  nextCostText,
  shuffle,
  shuffleDeck,
  type SimKind,
  type SimState,
} from "@/lib/simulators";
import type { Card } from "@/lib/scryfall/types";

import { card } from "./fake-scryfall";
import { mulberry32 } from "./generate-fixtures";
import { loadLegacySims } from "./legacy-simulators";

const plane = (n: number, type = "Plane — Test"): Card =>
  card({
    name: `Plane ${n}`,
    type_line: type,
    layout: "planar",
    image_uris: {
      small: `https://img/p${n}-s.jpg`,
      large: `https://img/p${n}-l.jpg`,
    },
  });

const scheme = (n: number, ongoing = false): Card =>
  card({
    name: `Scheme ${n}`,
    type_line: ongoing ? "Ongoing Scheme" : "Scheme",
    layout: "scheme",
    image_uris: {
      small: `https://img/s${n}-s.jpg`,
      large: `https://img/s${n}-l.jpg`,
    },
  });

const planes: Card[] = [
  plane(1),
  plane(2),
  plane(3, "Phenomenon"),
  plane(4),
  plane(5),
  plane(6, "Phenomenon"),
  plane(7),
  plane(8),
];

const schemes: Card[] = [
  scheme(1),
  scheme(2, true),
  scheme(3),
  scheme(4, true),
  scheme(5),
  scheme(6),
];

const pools: Record<string, Card[]> = { planechase: planes, archenemy: schemes };

const ids = (cards: Card[]): string[] => cards.map((c) => c.id);

describe("the two configurations", () => {
  it("match the old SIMS, word for word", () => {
    const sims = loadLegacySims({ pools });
    expect(SIMS).toEqual(sims.internals.SIMS);
  });

  it("match the old planar die", () => {
    const sims = loadLegacySims({ pools });
    expect(DIE).toEqual(sims.internals.DIE);
  });

  it("match the old roll-cost wording", () => {
    const sims = loadLegacySims({ pools });
    for (let r = 0; r < 6; r++)
      expect(nextCostText(r)).toBe(sims.internals.nextCostText(r));
  });
});

describe("the card predicates", () => {
  const sims = loadLegacySims({ pools });
  const cards: Card[] = [
    ...planes,
    ...schemes,
    card({ name: "No types", type_line: undefined }),
    { id: "faced", name: "Two faces", card_faces: [{ image_uris: { small: "a", large: "b" } }] },
    /*
     * Both a card image and face images. Scryfall does this for reversible
     * printings, and it is the case that says which one wins.
     */
    {
      id: "both",
      name: "Card and faces",
      image_uris: { small: "card-s", large: "card-l" },
      card_faces: [{ image_uris: { small: "face-s", large: "face-l" } }],
    },
  ];

  it("agree on phenomena and ongoing schemes", () => {
    cards.forEach((c) => {
      expect(isPhenomenon(c)).toBe(sims.internals.isPhenomenon(c));
      expect(isOngoing(c)).toBe(sims.internals.isOngoing(c));
    });
  });

  it("agree on which image to show", () => {
    cards.forEach((c) => {
      (["small", "large"] as const).forEach((size) => {
        // The old code returned `undefined` for a card with no image at all;
        // the port returns "", which is what an <img src> needs.
        expect(imageOf(c, size)).toBe(sims.internals.imageOf(c, size) ?? "");
      });
    });
  });
});

describe("the shuffle", () => {
  it("deals the same deck from the same random source", () => {
    const sims = loadLegacySims({ pools, random: mulberry32(99) });
    const rng = mulberry32(99);
    const mine = shuffle(planes, (n) => Math.floor(rng() * n));
    expect(ids(mine)).toEqual(ids(sims.internals.shuffle(planes)));
  });

  it("leaves the input alone", () => {
    const before = ids(planes);
    shuffle(planes, (n) => n - 1);
    expect(ids(planes)).toEqual(before);
  });
});

/**
 * One scripted run, step by step, on both implementations.
 *
 * `shuffle` is the only step that consumes randomness, and both sides consume
 * the same number of values in the same order, so two generators seeded alike
 * stay in step.
 */
async function runBoth(
  kind: SimKind,
  script: Array<
    | { do: "shuffle" }
    | { do: "draw" }
    | { do: "abandon"; index: number }
    | { do: "newTurn" }
    | { do: "phenomena"; on: boolean }
    /* Leaving the tab and coming back: the status goes back to derived. */
    | { do: "reopen" }
  >,
  seed = 7,
) {
  const sims = loadLegacySims({ pools, random: mulberry32(seed) });
  await sims.show(kind);

  const rng = mulberry32(seed);
  const rnd = (n: number) => Math.floor(rng() * n);
  let state: SimState = emptySimState();
  let message: string | null = null;
  const pool = pools[kind];
  let includePhenomena = true;

  const legacyState = () => sims.internals.state[kind];
  const snapshot = () => ({
    deck: ids(state.deck),
    current: state.current?.id ?? null,
    history: ids(state.history),
    ongoing: ids(state.ongoing),
    rolls: state.rolls,
    status: message ?? derivedStatus(state, kind, pool.length),
  });
  const legacySnapshot = () => {
    const st = legacyState();
    return {
      deck: ids(st.deck),
      current: st.current?.id ?? null,
      history: ids(st.history),
      ongoing: ids(st.ongoing),
      rolls: st.rolls,
      status: sims.status(),
    };
  };

  // Before anything is pressed, both should say the same thing.
  expect(snapshot()).toEqual(legacySnapshot());

  for (const [i, step] of script.entries()) {
    switch (step.do) {
      case "shuffle": {
        const result = shuffleDeck(state, {
          kind,
          pool,
          includePhenomena,
          rnd,
        });
        state = result.state;
        message = result.message ?? null;
        sims.internals.doShuffle();
        break;
      }
      case "draw": {
        const result = drawNext(state, kind);
        if (result) {
          state = result.state;
          message = result.message ?? null;
        }
        sims.internals.doDraw();
        break;
      }
      case "abandon": {
        const result = abandonAt(state, step.index);
        if (result) {
          state = result.state;
          message = result.message ?? null;
        }
        sims.internals.abandon(step.index);
        break;
      }
      case "newTurn": {
        const result = newTurn(state);
        state = result.state;
        message = result.message ?? null;
        sims.internals.newTurn();
        break;
      }
      case "phenomena": {
        includePhenomena = step.on;
        sims.setPhenomena(step.on);
        break;
      }
      case "reopen": {
        message = null;
        await sims.show(kind);
        break;
      }
    }
    expect(snapshot(), `step ${i + 1}: ${step.do}`).toEqual(legacySnapshot());
  }
}

describe("the deck mechanics", () => {
  it("planeswalks the same way", async () => {
    await runBoth("planechase", [
      { do: "shuffle" },
      // Coming back to the tab before drawing: "Deck ready: N planes…"
      { do: "reopen" },
      { do: "draw" },
      { do: "draw" },
      { do: "newTurn" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "shuffle" },
      { do: "draw" },
    ]);
  });

  it("leaves phenomena out when they are switched off", async () => {
    await runBoth("planechase", [
      { do: "phenomena", on: false },
      { do: "shuffle" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
    ]);
  });

  it("keeps ongoing schemes in play and abandons them the same way", async () => {
    await runBoth("archenemy", [
      { do: "shuffle" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "abandon", index: 0 },
      { do: "draw" },
      { do: "abandon", index: 0 },
      { do: "draw" },
    ]);
  });

  it("runs the scheme deck dry when every scheme is ongoing", async () => {
    const onlyOngoing = [scheme(10, true), scheme(11, true)];
    const sims = loadLegacySims({
      pools: { ...pools, archenemy: onlyOngoing },
      random: mulberry32(3),
    });
    await sims.show("archenemy");
    sims.internals.doShuffle();
    sims.internals.doDraw();
    sims.internals.doDraw();
    sims.internals.doDraw();

    const rng = mulberry32(3);
    const rnd = (n: number) => Math.floor(rng() * n);
    let state = shuffleDeck(emptySimState(), {
      kind: "archenemy",
      pool: onlyOngoing,
      includePhenomena: true,
      rnd,
    }).state;
    let message: string | null = null;
    for (let i = 0; i < 3; i++) {
      const step = drawNext(state, "archenemy");
      if (!step) break;
      state = step.state;
      message = step.message ?? null;
    }
    expect(message).toBe(
      "The deck is empty: every scheme is ongoing. Abandon one to continue.",
    );
    expect(sims.status()).toBe(message);
    expect(state.current).toBeNull();
    expect(ids(state.ongoing)).toEqual(ids(sims.internals.state.archenemy.ongoing));
  });
});
