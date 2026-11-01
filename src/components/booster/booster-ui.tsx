"use client";

/*
 * The booster page: the two builders, which share every control below the
 * section strip and differ only in the mode selected.
 */
import { useOptionsStore, type Mode } from "@/store/options";

import { GeneratePanel } from "./generate-panel";
import { PackOptions } from "./pack-options";
import { SetInfo } from "./set-info";
import { SetPicker } from "./set-picker";
import { SlotPanel } from "./slot-panel";

/**
 * The blurb above the controls. Wording kept from the old `#tabBlurb`; the
 * simulators carry their own, in `lib/simulators`.
 */
const BLURB: Record<Mode, string> = {
  play: "14-card Booster Packs — Play Boosters renamed — from any expansion, core or masters set, built with Wizards' 2027 rules.",
  commander:
    "20-card Commander draft boosters: the official sets (Commander Legends, Battle for Baldur's Gate, Commander Masters), or any set built with one of their layouts.",
};

export function BoosterUi() {
  const mode = useOptionsStore((s) => s.mode);

  return (
    <>
      <p className="text-sm text-muted-foreground">{BLURB[mode]}</p>
      <SetPicker />
      <SetInfo />
      <PackOptions />
      <SlotPanel />
      <GeneratePanel />
    </>
  );
}
