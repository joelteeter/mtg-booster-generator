"use client";

/*
 * "How each card slot is determined" — the collapsible panel.
 *
 * The generator samples from exactly the outcome lists shown here, so the
 * explanation cannot drift from what actually happens.
 */
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LAYOUTS } from "@/lib/booster";
import { expectedChips } from "@/lib/explain";
import { useSpec } from "@/hooks/use-spec";
import { isCommanderAny, useOptionsStore } from "@/store/options";

import { ExpectedChips } from "./expected-chips";
import { ModifierList } from "./modifier-list";
import { SlotTable } from "./slot-table";
import { VanillaDiff } from "./vanilla-diff";

export function SlotPanel() {
  const mode = useOptionsStore((s) => s.mode);
  const selection = useOptionsStore((s) => s.selection);
  const cmdAny = isCommanderAny({ mode, selection });
  const spec = useSpec();
  const { slots, diffs, diffCount, stats, pools, opts, code, layout } = spec;

  const layoutText =
    spec.mode === "commander" && cmdAny && layout ? ` · ${LAYOUTS[layout]}` : "";
  const badge =
    `— ${spec.mode === "play" ? "Play" : "Commander"} · ${code ? code.toUpperCase() : "no set"}${layoutText}` +
    ` · ${opts.vanilla ? "Vanilla (official odds)" : "Fun mode x" + opts.mult}` +
    (diffCount
      ? ` · ${diffCount} change${diffCount === 1 ? "" : "s"} from vanilla`
      : "");

  const chips = expectedChips(slots, stats, pools, spec.mode, opts);

  return (
    /*
     * Closed to begin with, like the old `<details id="howItWorks">`, which
     * carried no `open` attribute. It is a reference panel, and leaving it open
     * pushed the Generate button off the first screen.
     */
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left font-medium hover:bg-muted/50">
        <ChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span>How each card slot is determined</span>
        <Badge
          variant="outline"
          className="h-auto max-w-full shrink whitespace-normal text-left font-normal"
        >
          {badge}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-3">
        {!stats && (
          <p className="text-sm text-muted-foreground">
            {code
              ? `Loading card counts for ${code.toUpperCase()}… percentages that depend on the set show a formula until then.`
              : "Pick a set to see exact percentages."}
          </p>
        )}
        {!opts.vanilla && (
          <VanillaDiff
            slots={slots}
            diffs={diffs}
            diffCount={diffCount}
            guest={opts.guest}
          />
        )}
        <SlotTable
          slots={slots}
          diffs={diffs}
          stats={stats}
          pools={pools}
          opts={opts}
        />
        <ExpectedChips chips={chips} />
        <ModifierList
          slots={slots}
          stats={stats}
          opts={opts}
          mode={spec.mode}
          code={code}
          layout={layout}
          cmdAny={cmdAny}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
