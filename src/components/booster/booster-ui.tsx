"use client";

/*
 * The four tabs: two booster builders and the two simulators.
 */
import { Simulator } from "@/components/sim/simulator";
import type { SimKind } from "@/lib/simulators";
import { isBoosterMode, useOptionsStore } from "@/store/options";

import { GeneratePanel } from "./generate-panel";
import { PackOptions } from "./pack-options";
import { SetInfo } from "./set-info";
import { SetPicker } from "./set-picker";
import { SlotPanel } from "./slot-panel";
import { TAB_BLURB, TabStrip } from "./tab-strip";

export function BoosterUi() {
  const mode = useOptionsStore((s) => s.mode);

  return (
    <div className="flex flex-col gap-6">
      <TabStrip />

      {!isBoosterMode(mode) ? (
        <Simulator kind={mode as SimKind} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{TAB_BLURB[mode]}</p>
          <SetPicker />
          <SetInfo />
          <PackOptions />
          <SlotPanel />
          <GeneratePanel />
        </>
      )}
    </div>
  );
}
