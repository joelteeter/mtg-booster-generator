"use client";

/*
 * The two booster builders, which share one page because they share every
 * control below them: the set picker, the options and the slot panel. This is
 * the old `#tabs` strip, minus the two simulators that are pages of their own.
 */
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExportStore } from "@/store/export";
import { usePacksStore } from "@/store/packs";
import { useOptionsStore, type Mode } from "@/store/options";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "play", label: "Booster Pack" },
  { value: "commander", label: "Commander Draft Booster" },
];

export function ModeTabs() {
  const mode = useOptionsStore((s) => s.mode);
  const setMode = useOptionsStore((s) => s.setMode);
  const resetPacks = usePacksStore((s) => s.reset);
  const setExportStatus = useExportStore((s) => s.setStatus);

  /*
   * Switching drops the last run: the packs were built for the builder being
   * left, and so were the downloads beside them. The old app did this for all
   * four tabs by hiding `#downloadContainer`; the simulators are pages now and
   * leaving for one keeps the run, because it is still about these packs.
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
        {MODES.map((m) => (
          <TabsTrigger key={m.value} value={m.value}>
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
