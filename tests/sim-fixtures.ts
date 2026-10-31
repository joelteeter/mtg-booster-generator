/*
 * The fake planar and scheme decks, and the scripted runs the sweep plays.
 *
 * Shared with the recorder that read the old simulators' answers out, so both
 * key on the same scripts.
 */
import type { Card } from "@/lib/scryfall/types";

import { card } from "./fake-scryfall";

export const plane = (n: number, type = "Plane — Test"): Card =>
  card({
    name: `Plane ${n}`,
    type_line: type,
    layout: "planar",
    image_uris: {
      small: `https://img/p${n}-s.jpg`,
      large: `https://img/p${n}-l.jpg`,
    },
  });

export const scheme = (n: number, ongoing = false): Card =>
  card({
    name: `Scheme ${n}`,
    type_line: ongoing ? "Ongoing Scheme" : "Scheme",
    layout: "scheme",
    image_uris: {
      small: `https://img/s${n}-s.jpg`,
      large: `https://img/s${n}-l.jpg`,
    },
  });

export const planes: Card[] = [
  plane(1),
  plane(2),
  plane(3, "Phenomenon"),
  plane(4),
  plane(5),
  plane(6, "Phenomenon"),
  plane(7),
  plane(8),
];

export const schemes: Card[] = [
  scheme(1),
  scheme(2, true),
  scheme(3),
  scheme(4, true),
  scheme(5),
  scheme(6),
];

export const pools: Record<string, Card[]> = { planechase: planes, archenemy: schemes };

export type SimStep =
  | { do: "shuffle" }
  | { do: "draw" }
  | { do: "abandon"; index: number }
  | { do: "newTurn" }
  | { do: "phenomena"; on: boolean }
  /* Leaving the tab and coming back: the status goes back to derived. */
  | { do: "reopen" };

export const SCRIPTS: Record<
  string,
  { kind: "planechase" | "archenemy"; steps: SimStep[] }
> = {
  planeswalk: {
    kind: "planechase",
    steps: [
      { do: "shuffle" },
      // Coming back to the tab before drawing: "Deck ready: N planes…"
      { do: "reopen" },
      { do: "draw" },
      { do: "draw" },
      { do: "newTurn" },
      { do: "draw" },
      { do: "draw" },
      { do: "shuffle" },
      { do: "draw" },
    ],
  },
  "phenomena off": {
    kind: "planechase",
    steps: [
      { do: "phenomena", on: false },
      { do: "shuffle" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
      { do: "draw" },
    ],
  },
  ongoing: {
    kind: "archenemy",
    steps: [
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
    ],
  },
};
