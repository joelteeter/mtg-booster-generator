/*
 * Planechase and Archenemy deck state, one per simulator.
 *
 * The old `js/simulators.js` held this in a closure keyed by simulator, which
 * is why switching tabs and coming back kept your deck and your ongoing
 * schemes. That survives here because the store outlives the components.
 *
 * The card pools are not here: they are one Scryfall search each and belong to
 * TanStack Query, like every other pool in the app.
 */
import { create } from "zustand";

import {
  abandonAt,
  drawNext,
  emptySimState,
  newTurn,
  shuffleDeck,
  type DieFace,
  type IndexRng,
  type SimKind,
  type SimState,
} from "@/lib/simulators";
import type { Card } from "@/lib/scryfall/types";

interface SimsStore {
  byKind: Record<SimKind, SimState>;
  /** A message from the last action, or null to derive one from the state. */
  message: Record<SimKind, string | null>;
  /** Planechase's "include phenomena" checkbox. */
  includePhenomena: boolean;
  /** The enlarged card, shown over everything. */
  zoom: Card | null;

  shuffle(kind: SimKind, pool: Card[], rnd?: IndexRng): void;
  draw(kind: SimKind): void;
  abandon(index: number): void;
  startTurn(): void;
  setDie(face: DieFace): void;
  setRotated(kind: SimKind, rotated: boolean): void;
  setIncludePhenomena(value: boolean): void;
  setMessage(kind: SimKind, message: string | null): void;
  setZoom(card: Card | null): void;
}

export const useSimsStore = create<SimsStore>((set) => ({
  byKind: { planechase: emptySimState(), archenemy: emptySimState() },
  message: { planechase: null, archenemy: null },
  includePhenomena: true,
  zoom: null,

  shuffle: (kind, pool, rnd) =>
    set((s) => {
      const step = shuffleDeck(s.byKind[kind], {
        kind,
        pool,
        includePhenomena: s.includePhenomena,
        rnd,
      });
      return {
        byKind: { ...s.byKind, [kind]: step.state },
        message: { ...s.message, [kind]: step.message ?? null },
      };
    }),

  draw: (kind) =>
    set((s) => {
      const step = drawNext(s.byKind[kind], kind);
      if (!step) return s;
      return {
        byKind: { ...s.byKind, [kind]: step.state },
        message: { ...s.message, [kind]: step.message ?? null },
      };
    }),

  abandon: (index) =>
    set((s) => {
      const step = abandonAt(s.byKind.archenemy, index);
      if (!step) return s;
      return {
        byKind: { ...s.byKind, archenemy: step.state },
        message: { ...s.message, archenemy: step.message ?? null },
      };
    }),

  startTurn: () =>
    set((s) => {
      const step = newTurn(s.byKind.planechase);
      return {
        byKind: { ...s.byKind, planechase: step.state },
        message: { ...s.message, planechase: step.message ?? null },
      };
    }),

  /** The roll's animation lives in the component; this records its result. */
  setDie: (face) =>
    set((s) => ({
      byKind: {
        ...s.byKind,
        planechase: {
          ...s.byKind.planechase,
          die: face,
          rolls: s.byKind.planechase.rolls + 1,
        },
      },
      message: { ...s.message, planechase: null },
    })),

  /* Rotating re-derives the status line, as every other `render()` call did. */
  setRotated: (kind, rotated) =>
    set((s) => ({
      byKind: { ...s.byKind, [kind]: { ...s.byKind[kind], rotated } },
      message: { ...s.message, [kind]: null },
    })),

  setIncludePhenomena: (value) => set({ includePhenomena: value }),
  setMessage: (kind, message) =>
    set((s) => ({ message: { ...s.message, [kind]: message } })),
  setZoom: (card) => set({ zoom: card }),
}));
