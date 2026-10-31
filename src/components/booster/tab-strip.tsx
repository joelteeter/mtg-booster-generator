"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOptionsStore, type Mode } from "@/store/options";

const TABS: Array<{ value: Mode; label: string }> = [
  { value: "play", label: "Booster Pack" },
  { value: "commander", label: "Commander Draft Booster" },
  { value: "planechase", label: "Planechase Simulator" },
  { value: "archenemy", label: "Archenemy Simulator" },
];

/** The blurb under the tab strip, per tab. Wording kept from the old UI. */
export const TAB_BLURB: Record<string, string> = {
  play: "14-card Booster Packs — Play Boosters renamed — from any expansion, core or masters set, built with Wizards' 2027 rules.",
  commander:
    "20-card Commander draft boosters: the official sets (Commander Legends, Battle for Baldur's Gate, Commander Masters), or any set built with one of their layouts.",
  planechase: "Shuffle a planar deck, draw planes and roll the planar die.",
  archenemy: "Shuffle a scheme deck and draw a scheme each turn.",
};

export function TabStrip() {
  const mode = useOptionsStore((s) => s.mode);
  const setMode = useOptionsStore((s) => s.setMode);
  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
      <TabsList className="h-auto flex-wrap justify-start">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
