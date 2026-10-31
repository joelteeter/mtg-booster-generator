"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOptionsStore, type Mode } from "@/store/options";
import { useExportStore } from "@/store/export";
import { usePacksStore } from "@/store/packs";

const TABS: Array<{ value: Mode; label: string }> = [
  { value: "play", label: "Booster Pack" },
  { value: "commander", label: "Commander Draft Booster" },
  { value: "planechase", label: "Planechase Simulator" },
  { value: "archenemy", label: "Archenemy Simulator" },
];

/**
 * The blurb under the tab strip, for the two booster tabs. Wording kept from
 * the old `#tabBlurb`; the simulator tabs have their own, in `lib/simulators`.
 */
export const TAB_BLURB: Record<string, string> = {
  play: "14-card Booster Packs — Play Boosters renamed — from any expansion, core or masters set, built with Wizards' 2027 rules.",
  commander:
    "20-card Commander draft boosters: the official sets (Commander Legends, Battle for Baldur's Gate, Commander Masters), or any set built with one of their layouts.",
};

export function TabStrip() {
  const mode = useOptionsStore((s) => s.mode);
  const setMode = useOptionsStore((s) => s.setMode);
  const resetPacks = usePacksStore((s) => s.reset);
  const setExportStatus = useExportStore((s) => s.setStatus);
  /*
   * Changing tab drops the last run. The old app hid `#downloadContainer`,
   * which held the downloads table and the preview both, so the packs stayed
   * in a global that nothing could reach again.
   */
  const change = (value: string) => {
    if (value === mode) return;
    setMode(value as Mode);
    resetPacks();
    setExportStatus("");
  };
  return (
    <Tabs value={mode} onValueChange={change}>
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
