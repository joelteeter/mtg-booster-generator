"use client";

/*
 * The set pickers: one for Booster Packs, one for Commander boosters.
 *
 * Unreleased sets are kept, because a partly spoiled set is still worth
 * simulating, but they are grouped under their own heading and marked so nobody
 * picks one by accident.
 */
import { useEffect } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMANDER_SETS, LAYOUTS, todayISO } from "@/lib/booster";
import type { CommanderLayout } from "@/lib/booster/types";
import {
  anySets,
  defaultSet,
  groupByRelease,
  playSets,
  setLabel,
} from "@/lib/scryfall/sets";
import type { ScryfallSet } from "@/lib/scryfall/types";
import { useSets } from "@/hooks/use-scryfall";
import { isCommanderAny, useOptionsStore } from "@/store/options";

/** Released and upcoming groups, as the old `grouped()` built them. */
function SetOptions({ sets }: { sets: ScryfallSet[] }) {
  const today = todayISO();
  const { upcoming, released } = groupByRelease(sets, today);
  return (
    <>
      {upcoming.length > 0 && (
        <SelectGroup>
          <SelectLabel>🔜 Not released yet</SelectLabel>
          {upcoming.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {setLabel(s, today)}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
      {released.length > 0 && (
        <SelectGroup>
          <SelectLabel>Released</SelectLabel>
          {released.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {setLabel(s, today)}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
    </>
  );
}

function LiveSetSelect({
  id,
  label,
  sets,
  value,
  onChange,
  isLoading,
  isError,
}: {
  id: string;
  label: string;
  sets: ScryfallSet[];
  value: string;
  onChange: (code: string) => void;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={
              isError ? "Error loading sets" : isLoading ? "Loading…" : "Choose a set"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SetOptions sets={sets} />
        </SelectContent>
      </Select>
    </div>
  );
}

export function SetPicker() {
  const mode = useOptionsStore((s) => s.mode);
  const selection = useOptionsStore((s) => s.selection);
  const setSelection = useOptionsStore((s) => s.setSelection);
  const cmdAny = isCommanderAny({ mode, selection });

  const { data, isLoading, isError } = useSets();
  const all = data ?? [];
  const play = playSets(all);
  const any = anySets(all);

  /*
   * Open on the newest released set built for Limited. The newest release is
   * often a supplemental product — on 30 October 2026 it was Mystery Booster
   * Commander Edition, 1 common and no mythics — which would show a pack the
   * app cannot sensibly build.
   */
  useEffect(() => {
    if (!play.length || selection.setSelect) return;
    const pick = defaultSet(play);
    if (pick) setSelection({ setSelect: pick.code });
  }, [play, selection.setSelect, setSelection]);

  useEffect(() => {
    if (!any.length || selection.cmdAnySetSelect) return;
    const pick = defaultSet(any);
    if (pick) setSelection({ cmdAnySetSelect: pick.code });
  }, [any, selection.cmdAnySetSelect, setSelection]);

  if (mode === "play")
    return (
      <div className="flex flex-col gap-4 sm:flex-row">
        <LiveSetSelect
          id="setSelect"
          label="Choose Expansion (Live API)"
          sets={play}
          value={selection.setSelect}
          onChange={(code) => setSelection({ setSelect: code, customSet: "" })}
          isLoading={isLoading}
          isError={isError}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="customSet">Or Type Set Code</Label>
          <Input
            id="customSet"
            placeholder="e.g. sos, dsk, vma"
            value={selection.customSet}
            onChange={(e) => setSelection({ customSet: e.target.value })}
          />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-md">
        <Label htmlFor="cmdSource">Card source</Label>
        <Select
          value={selection.cmdSource}
          onValueChange={(v) =>
            setSelection({ cmdSource: v as "official" | "any" })
          }
        >
          <SelectTrigger id="cmdSource" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="official">
              Official Commander booster set
            </SelectItem>
            <SelectItem value="any">
              Any set, built as a Commander booster
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!cmdAny ? (
        <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor="cmdSetSelect">Commander Booster Set</Label>
          <Select
            value={selection.cmdSetSelect}
            onValueChange={(code) => setSelection({ cmdSetSelect: code })}
          >
            <SelectTrigger id="cmdSetSelect" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(COMMANDER_SETS)
                .sort((a, b) => b.released.localeCompare(a.released))
                .map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name} ({s.code.toUpperCase()})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <LiveSetSelect
              id="cmdAnySetSelect"
              label="Choose Set (Live API)"
              sets={any}
              value={selection.cmdAnySetSelect}
              onChange={(code) =>
                setSelection({ cmdAnySetSelect: code, cmdAnyCustom: "" })
              }
              isLoading={isLoading}
              isError={isError}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="cmdAnyCustom">Or Type Set Code</Label>
              <Input
                id="cmdAnyCustom"
                placeholder="e.g. ltr, dmu, otj"
                value={selection.cmdAnyCustom}
                onChange={(e) => setSelection({ cmdAnyCustom: e.target.value })}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-xl">
            <Label htmlFor="cmdLayout">Pack layout (card slots)</Label>
            <Select
              value={selection.cmdLayout}
              onValueChange={(v) =>
                setSelection({ cmdLayout: v as CommanderLayout })
              }
            >
              <SelectTrigger id="cmdLayout" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cmr">
                  Commander Legends: 2 legends, foil-etched chance
                </SelectItem>
                <SelectItem value="clb">
                  Battle for Baldur&apos;s Gate: 1 legend + 1 Background
                </SelectItem>
                <SelectItem value="cmm">
                  Commander Masters: 3 legends, extra rare chance
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Uses the chosen layout&apos;s slots and odds with the set&apos;s own
            cards: its legendary creatures and planeswalkers fill the legendary
            slots. Slots the set can&apos;t fill (no Backgrounds, no Prismatic
            Piper, too few legends) fall back as shown in the slot table.{" "}
            {LAYOUTS[selection.cmdLayout]}.
          </p>
        </div>
      )}
    </div>
  );
}
