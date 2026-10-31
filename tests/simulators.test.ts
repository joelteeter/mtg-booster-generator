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
  type SimState,
} from "@/lib/simulators";
import type { Card } from "@/lib/scryfall/types";

import { card } from "./fake-scryfall";
import { mulberry32 } from "./generate-fixtures";
import { golden, readGolden } from "./goldens";
import { renderCalls, renderValue } from "./render";
import { SCRIPTS, planes, pools, scheme, schemes } from "./sim-fixtures";

const recorded = readGolden("simulators");

const ids = (cards: Card[]): string[] => cards.map((c) => c.id);

describe("the two configurations", () => {
  it("match the old SIMS, word for word", () => {
    expect(renderValue(SIMS)).toBe(golden(recorded, "SIMS"));
  });

  it("match the old planar die", () => {
    expect(renderValue(DIE)).toBe(golden(recorded, "DIE"));
  });

  it("match the old roll-cost wording", () => {
    expect(renderCalls([0, 1, 2, 3, 4, 5].map((r) => nextCostText(r)))).toBe(
      golden(recorded, "nextCostText"),
    );
  });
});

describe("the card predicates", () => {
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

  /*
   * The old code returned `undefined` for a card with no image at all; the
   * port returns "", which is what an <img src> needs, so that is how the
   * recording was taken.
   */
  it("agree on phenomena, ongoing schemes and which image to show", () => {
    expect(
      renderCalls(
        cards.map((c) => ({
          phenomenon: isPhenomenon(c),
          ongoing: isOngoing(c),
          small: imageOf(c, "small"),
          large: imageOf(c, "large"),
        })),
      ),
    ).toBe(golden(recorded, "predicates"));
  });
});

describe("the shuffle", () => {
  it("deals the same deck from the same random source", () => {
    const rng = mulberry32(99);
    expect(renderValue(ids(shuffle(planes, (n) => Math.floor(rng() * n))))).toBe(
      golden(recorded, "shuffle seed 99"),
    );
  });

  it("leaves the input alone", () => {
    const before = ids(planes);
    shuffle(planes, (n) => n - 1);
    expect(ids(planes)).toEqual(before);
  });
});

/**
 * One scripted run, step by step, against the old simulators' own snapshots.
 *
 * `shuffle` is the only step that consumes randomness, and the recording was
 * taken from a generator seeded the same way, so the two stay in step.
 */
async function runScript(name: string) {
  const { kind, steps } = SCRIPTS[name];
  const rng = mulberry32(7);
  const rnd = (n: number) => Math.floor(rng() * n);
  let state: SimState = emptySimState();
  let message: string | null = null;
  const pool = pools[kind];
  let includePhenomena = true;

  const snapshot = () => ({
    deck: ids(state.deck),
    current: state.current?.id ?? null,
    history: ids(state.history),
    ongoing: ids(state.ongoing),
    rolls: state.rolls,
    status: message ?? derivedStatus(state, kind, pool.length),
  });

  const shots = [snapshot()];
  for (const step of steps) {
    switch (step.do) {
      case "shuffle": {
        const result = shuffleDeck(state, { kind, pool, includePhenomena, rnd });
        state = result.state;
        message = result.message ?? null;
        break;
      }
      case "draw": {
        const result = drawNext(state, kind);
        if (result) {
          state = result.state;
          message = result.message ?? null;
        }
        break;
      }
      case "abandon": {
        const result = abandonAt(state, step.index);
        if (result) {
          state = result.state;
          message = result.message ?? null;
        }
        break;
      }
      case "newTurn": {
        const result = newTurn(state);
        state = result.state;
        message = result.message ?? null;
        break;
      }
      case "phenomena": {
        includePhenomena = step.on;
        break;
      }
      case "reopen": {
        // Leaving the tab and coming back: the status goes back to derived.
        message = null;
        break;
      }
    }
    shots.push(snapshot());
  }
  expect(renderCalls(shots)).toBe(golden(recorded, `script ${name}`));
}

describe("the deck mechanics", () => {
  it("planeswalks the same way", async () => {
    await runScript("planeswalk");
  });

  it("leaves phenomena out when they are switched off", async () => {
    await runScript("phenomena off");
  });

  it("keeps ongoing schemes in play and abandons them the same way", async () => {
    await runScript("ongoing");
  });

  it("runs the scheme deck dry when every scheme is ongoing", async () => {
    const onlyOngoing = [scheme(10, true), scheme(11, true)];
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
    expect(state.current).toBeNull();
    expect(
      renderValue({
        status: message,
        ongoing: ids(state.ongoing),
        onlyOngoingIds: ids(onlyOngoing),
      }),
    ).toBe(golden(recorded, "all ongoing"));
  });
});
