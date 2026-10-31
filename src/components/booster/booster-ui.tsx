"use client";

/*
 * The two booster tabs. The simulator tabs are a separate feature and are not
 * part of this phase.
 */
import { Button } from "@/components/ui/button";
import { isBoosterMode, useOptionsStore } from "@/store/options";

import { PackOptions } from "./pack-options";
import { SetInfo } from "./set-info";
import { SetPicker } from "./set-picker";
import { SlotPanel } from "./slot-panel";
import { TAB_BLURB, TabStrip } from "./tab-strip";

function SimulatorPlaceholder({ mode }: { mode: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      <p>
        The {mode === "planechase" ? "Planechase" : "Archenemy"} simulator has
        not been ported yet. It still works in the current app.
      </p>
    </div>
  );
}

export function BoosterUi() {
  const mode = useOptionsStore((s) => s.mode);

  return (
    <div className="flex flex-col gap-6">
      <TabStrip />
      <p className="text-sm text-muted-foreground">{TAB_BLURB[mode]}</p>

      {!isBoosterMode(mode) ? (
        <SimulatorPlaceholder mode={mode} />
      ) : (
        <>
          <SetPicker />
          <SetInfo />
          <PackOptions />
          <SlotPanel />
          <div className="flex flex-col gap-2">
            <Button size="lg" disabled className="self-start">
              Generate Booster Files
            </Button>
            <p className="text-sm text-muted-foreground">
              Generating, the preview and the exports are not ported yet — they
              come with the next phases. Everything above is live.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
