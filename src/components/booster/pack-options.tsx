"use client";

/*
 * The options form: pack count, vanilla mode, the fun options and the pack
 * separator.
 *
 * Vanilla mode disables the whole fun group rather than hiding it, as the old
 * `fieldset[disabled]` did — the options stay visible so it is clear what
 * vanilla is switching off.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LAND_CYCLES } from "@/lib/booster";
import { cn } from "@/lib/utils";
import {
  isCommanderAny,
  selectOptions,
  useOptionsStore,
  type TabOptions,
} from "@/store/options";

function CheckRow({
  id,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className={cn(
          "font-normal leading-snug",
          disabled && "opacity-50",
        )}
      >
        {children}
      </Label>
    </div>
  );
}

function Fieldset({
  legend,
  disabled,
  children,
}: {
  legend: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      disabled={disabled}
      /*
       * `min-w-0` matters: a fieldset defaults to `min-width: min-content`, so
       * without it the longest option in the bonus-land select ("Classic:
       * original duals + fetch lands…") forces the whole form wider than a
       * phone viewport and the page scrolls sideways.
       */
      className={cn(
        "min-w-0 rounded-lg border p-4",
        disabled && "opacity-60",
      )}
    >
      <legend className="px-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

export function PackOptions() {
  const mode = useOptionsStore((s) => s.mode);
  const selection = useOptionsStore((s) => s.selection);
  const options = useOptionsStore(selectOptions);
  const setOption = useOptionsStore((s) => s.setOption);
  const noFoils = useOptionsStore((s) => s.noFoils);
  const setNoFoils = useOptionsStore((s) => s.setNoFoils);
  const set = <K extends keyof TabOptions>(k: K) => (v: TabOptions[K]) =>
    setOption(k, v);

  const playOnly = mode === "play";
  const cmdAny = isCommanderAny({ mode, selection });
  const sepOn = options.includeBonus;

  const vanillaHint = playOnly
    ? "Official odds for every slot, in the real order: 6 commons, a seventh that can be a Special Guest, 3 uncommons, a rare or mythic, a land, then two wildcards" +
      (noFoils
        ? ". Fun options are switched off; the printing option above still applies, since vanilla odds do not make a printer able to do foils."
        : " — the last foil only when it is a rare or mythic. Fun options are switched off.")
    : cmdAny
      ? "Uses the chosen layout's published odds with this set's cards. Fun options (multiplier, Guest List swap) are switched off."
      : "Uses the published Commander draft booster layout for the chosen set. Fun options (multiplier, Guest List swap) are switched off.";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-[12rem]">
        <Label htmlFor="packCount">Number of Packs</Label>
        <Input
          id="packCount"
          type="number"
          min={1}
          max={100}
          value={options.packCount}
          onChange={(e) =>
            setOption("packCount", Math.max(1, Math.min(100, Number(e.target.value) || 1)))
          }
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <Switch
            id="vanillaToggle"
            checked={options.vanilla}
            onCheckedChange={set("vanilla")}
          />
          <Label htmlFor="vanillaToggle" className="font-normal">
            🍦 Vanilla mode: official pack odds for every slot
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">{vanillaHint}</p>
      </div>

      <Fieldset legend="🖨️ Printing">
        <CheckRow id="noFoils" checked={noFoils} onChange={setNoFoils}>
          Leave every card non-foil?
        </CheckRow>
        <p className="text-sm text-muted-foreground">
          {noFoils
            ? "No slot comes out foil, so nothing in the CSV or the preview is marked FOIL or ETCHED, and no card is drawn in a printing that was only ever made as a foil — surge foil, galaxy foil, foil-etched, box toppers, serialized. Those are separate printings with their own treatment rather than a finish, so they would otherwise reach the PDF looking like it. Separator lands and tokens follow the same rule. Every slot keeps its odds and still gives you a card."
            : "Slots come out foil at their real rates, marked FOIL or ETCHED in the preview and the CSV, and any printing of a card can be drawn — including ones only made as a foil, such as surge foil. An ordinary foil is the same printing as its non-foil and looks the same in the PDF; those treatments do not."}
        </p>
      </Fieldset>

      <Fieldset legend="🎉 Fun options" disabled={options.vanilla}>
        <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="funMultiplier">Fun Booster Multiplier</Label>
          <Select
            value={String(options.mult)}
            onValueChange={(v) => setOption("mult", Number(v))}
            disabled={options.vanilla}
          >
            <SelectTrigger id="funMultiplier" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">x1 (no extra upgrades)</SelectItem>
              <SelectItem value="2">x2</SelectItem>
              <SelectItem value="3">x3</SelectItem>
              <SelectItem value="4">x4</SelectItem>
              <SelectItem value="5">x5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CheckRow
          id="preferGuestList"
          checked={options.preferGuestList}
          onChange={set("preferGuestList")}
          disabled={options.vanilla}
        >
          Prefer Guest List versions (50% swap chance)?
        </CheckRow>
        {playOnly && (
          <>
            <CheckRow
              id="foilToggle"
              checked={options.foilToggle && !noFoils}
              onChange={set("foilToggle")}
              disabled={options.vanilla || noFoils}
            >
              Make the second wildcard (slot 14) foil?
              {noFoils && " — off while cards are left non-foil"}
            </CheckRow>
            <CheckRow
              id="listToggle"
              checked={options.listToggle}
              onChange={set("listToggle")}
              disabled={options.vanilla}
            >
              Add The List to slot 7 (12.5% × multiplier)?
            </CheckRow>
          </>
        )}
      </Fieldset>

      <Fieldset legend="🗺️ Pack separator">
        <CheckRow
          id="includeBonus"
          checked={options.includeBonus}
          onChange={set("includeBonus")}
        >
          Add a separator card after each pack?
        </CheckRow>
        <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor="separatorType">Separator card</Label>
          <Select
            value={options.separatorType}
            onValueChange={(v) =>
              setOption("separatorType", v as "land" | "token")
            }
            disabled={!sepOn}
          >
            <SelectTrigger id="separatorType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="land">Land</SelectItem>
              <SelectItem value="token">
                Token (a different token on each side)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {options.separatorType === "land" && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-xl">
            <Label htmlFor="bonusType">Bonus land type</Label>
            <Select
              value={options.bonusType}
              onValueChange={set("bonusType")}
              disabled={!sepOn}
            >
              <SelectTrigger id="bonusType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAND_CYCLES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          The separator is not part of the pack, so it stays available in
          vanilla mode. A token separator prints one token on the front and a
          different one from the same set on the back, so print those pages
          double-sided.
        </p>
        <CheckRow
          id="tokenSheets"
          checked={options.tokenSheets}
          onChange={set("tokenSheets")}
        >
          Also make token sheets: one of every token in the set
        </CheckRow>
        <p className="text-sm text-muted-foreground">
          Adds full pages after the packs, in collector-number order, two tokens
          per card (front and back). A 9-card page holds 18 tokens; any slots
          left over on the last page are filled with random tokens from the set.
        </p>
      </Fieldset>

      <Fieldset legend="🏞 Land sheet">
        <CheckRow
          id="landSheet"
          checked={options.landSheet}
          onChange={set("landSheet")}
        >
          Also make a land sheet: every basic land in the set
        </CheckRow>
        <p className="text-sm text-muted-foreground">
          One page after everything else: each of the set&apos;s basic lands
          once, then the set&apos;s full-art lands to fill the nine slots —
          which in a modern set are those same basics in a second treatment, so
          the page comes out as one of each plus a few alternate arts. Printings
          that exist only as a foil are left out whatever the printing option
          says. Single-sided, unlike the token sheets: a land in a deck needs a
          card back.
        </p>
      </Fieldset>
    </div>
  );
}
