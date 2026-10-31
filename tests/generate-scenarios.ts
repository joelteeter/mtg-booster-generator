/*
 * The generation runs the sweep covers.
 *
 * Named here rather than inline in the test because the golden file recorded
 * from the old app is keyed by these names, and a recorder had to set up the
 * same runs.
 */
import type { SetSelection, TabOptions } from "@/store/options";

import type { FakeOptions } from "./fake-scryfall";

export interface Scenario {
  mode: "play" | "commander";
  selection?: Partial<SetSelection>;
  options?: Partial<TabOptions>;
  seed: number;
  /** Override the fake, e.g. to make The List 404. */
  fake?: Partial<FakeOptions>;
  /** Queries the fake is expected not to recognise, for the 404 paths. */
  allowUnknown?: string[];
}

export const SCENARIOS: Record<string, Scenario> = {
  // A non-default multiplier that vanilla mode has to ignore.
  vanilla: { mode: "play", seed: 1, options: { vanilla: true, mult: 4, packCount: 3 } },
  fun: {
    mode: "play",
    seed: 7,
    options: {
      mult: 3,
      foilToggle: true,
      listToggle: true,
      preferGuestList: true,
      packCount: 6,
    },
  },
  shock: { mode: "play", seed: 11, options: { bonusType: "shock" } },
  tokens: {
    mode: "play",
    seed: 3,
    options: { separatorType: "token", tokenSheets: true, packCount: 2 },
  },
  "no-separator": { mode: "play", seed: 5, options: { includeBonus: false } },
  "list-404": {
    mode: "play",
    seed: 7,
    options: { mult: 5, listToggle: true, packCount: 3 },
    fake: { random: {} },
    allowUnknown: ["set:plst"],
  },
  cmm: {
    mode: "commander",
    seed: 13,
    selection: { cmdSetSelect: "cmm" },
    options: { packCount: 2 },
  },
  "cmm-any": {
    mode: "commander",
    seed: 17,
    selection: { cmdSource: "any", cmdAnyCustom: "cmm", cmdLayout: "cmm" },
    options: { packCount: 1 },
  },
  /* Two packs plus the token sheets, so the downloads table has several rows. */
  "export-run": { mode: "play", seed: 11, options: { tokenSheets: true } },
  "export-run token": {
    mode: "play",
    seed: 11,
    options: { tokenSheets: true, separatorType: "token" },
  },
  preview: {
    mode: "play",
    seed: 23,
    options: { separatorType: "token", tokenSheets: true, packCount: 2 },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Both pack shapes reduced to the same comparable thing: the old app hung
 * `godPack` and `tokenSheet` on the array of cards, a `GeneratedPack` has them
 * as fields.
 */
export const normPacks = (packs: any[]): unknown =>
  packs.map((p) => ({
    godPack: !!p.godPack,
    tokenSheet: p.tokenSheet ?? null,
    cards: (p.cards ?? p).map((e: any) => ({
      id: e.card?.id ?? null,
      back: e.backCard?.id ?? null,
      finish: e.finish,
      slot: e.slot ?? null,
      label: e.label,
      bonus: !!e.bonus,
      tokenSlot: !!e.tokenSlot,
      filler: !!e.filler,
    })),
  }));

/**
 * CSV bodies as arrays of lines.
 *
 * A recorded value is compared line by line, so it cannot itself contain a
 * newline; splitting also makes a one-row difference show up as one changed
 * line instead of one enormous one.
 */
export const asLines = (files: { base: string[]; csv: string[] } | null) =>
  files && { base: files.base, csv: files.csv.map((c) => c.split("\n")) };
