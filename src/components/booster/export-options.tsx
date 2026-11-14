"use client";

/*
 * The print settings above the downloads table: paper, bleed, image quality,
 * how double-faced cards are handled, which way the printer turns the sheet
 * over, the card back, and the AI-enhance option.
 *
 * Same controls and same wording as the old `#downloadContainer`; laid out as
 * a grid rather than three floated rows, so it collapses to one column on a
 * phone instead of scrolling sideways.
 */
import { useRef } from "react";

import { Button } from "@/components/ui/button";
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
import { useExport } from "@/hooks/use-export";
import { useExportStore } from "@/store/export";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** How far one press of − or + moves the sheet, and how far it may go. */
const OFFSET_STEP_MM = 0.5;
const OFFSET_LIMIT_MM = 10;
/*
 * Rotation is a much smaller number than the offsets: a tenth of a degree
 * swings the bottom of a sheet about 0.3 mm, which is already near what can
 * be measured by eye. Past a degree or two the paper is going in crooked and
 * that is a problem for the paper guides, not for a correction.
 */
const ROTATION_STEP_DEG = 0.05;
const ROTATION_LIMIT_DEG = 2;

/**
 * One axis of the duplex offset: − , a number you can type, and +.
 *
 * Half a millimetre a press, because that is about the smallest shift worth
 * making and about what a printer's error moves between paper types. The
 * limit is well past any real misregistration; a sheet 10 mm out has a
 * different problem.
 */
function OffsetField({
  id,
  label,
  value,
  onChange,
  step = OFFSET_STEP_MM,
  limit = OFFSET_LIMIT_MM,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  limit?: number;
}) {
  const clamp = (v: number) =>
    Math.round(Math.max(-limit, Math.min(limit, v)) * 100) / 100;
  return (
    <Field id={id} label={label}>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`${label}: less`}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </Button>
        <Input
          id={id}
          type="number"
          step={step}
          min={-limit}
          max={limit}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
          className="w-20 text-center"
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`${label}: more`}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </Button>
      </div>
    </Field>
  );
}

export function ExportOptions() {
  const settings = useExportStore((s) => s.settings);
  const customBackName = useExportStore((s) => s.customBackName);
  const set = useExportStore((s) => s.set);
  const setCustomBack = useExportStore((s) => s.setCustomBack);
  const { compare, comparing, hasPacks, alignmentPrint, exporting } =
    useExport();
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="pdfPaper" label="PDF paper">
          <Select
            value={settings.paper}
            onValueChange={(v) => set("paper", v as "letter" | "a4")}
          >
            <SelectTrigger id="pdfPaper" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="letter">US Letter</SelectItem>
              <SelectItem value="a4">A4</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="pdfBleed" label="PDF outer bleed">
          <Select
            value={String(settings.bleedMm)}
            onValueChange={(v) => set("bleedMm", Number(v))}
          >
            <SelectTrigger id="pdfBleed" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">None (like MTGProxyPrinter)</SelectItem>
              <SelectItem value="1">1 mm</SelectItem>
              <SelectItem value="2">2 mm</SelectItem>
              <SelectItem value="3">3 mm</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="pdfQuality" label="PDF card images">
          <Select
            value={settings.quality}
            onValueChange={(v) => set("quality", v as "high" | "fast")}
          >
            <SelectTrigger id="pdfQuality" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High: Scryfall PNG, 300 dpi</SelectItem>
              <SelectItem value="fast">
                Faster: Scryfall large JPG, ~270 dpi
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="dfcMode" label="Double-faced cards">
          <Select
            value={settings.dfcMode}
            onValueChange={(v) =>
              set("dfcMode", v as "separate" | "frontOnly")
            }
          >
            <SelectTrigger id="dfcMode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="separate">
                Front and back as separate cards (for sleeves)
              </SelectItem>
              <SelectItem value="frontOnly">
                Front only; back face goes on the backs PDF (cut marks on
                backs only)
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="backFlip" label="Backs PDF, printer flips on">
          <Select
            value={settings.flip}
            onValueChange={(v) => set("flip", v as "long" | "short")}
          >
            <SelectTrigger id="backFlip" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long">
                Long edge (left column ↔ right column)
              </SelectItem>
              <SelectItem value="short">
                Short edge (top row ↔ bottom row)
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="backImage" label="Card back for normal cards">
          <Select
            value={settings.backImage}
            onValueChange={(v) => {
              const custom = v === "custom";
              set("backImage", custom ? "custom" : "standard");
              // As in the old app: choosing "my own image" opens the picker.
              if (custom && !settings.customBackUrl) fileInput.current?.click();
            }}
          >
            <SelectTrigger id="backImage" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard Magic card back</SelectItem>
              <SelectItem value="custom">My own image…</SelectItem>
            </SelectContent>
          </Select>
          <input
            ref={fileInput}
            id="backFile"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={settings.backImage === "custom" ? "text-sm" : "hidden"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setCustomBack(URL.createObjectURL(file), file.name);
            }}
          />
          {customBackName && (
            <p className="text-sm text-muted-foreground">
              Using {customBackName}; it&apos;s stretched to 63×88 mm (745×1040
              px works best).
            </p>
          )}
        </Field>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="newPagePerPack"
          checked={settings.newPagePerPack}
          onCheckedChange={(v) => set("newPagePerPack", v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="newPagePerPack" className="font-normal leading-snug">
          Start each pack on a new page (PDF and MTGProxyPrinter file)
        </Label>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="pdfEnhance"
              checked={settings.enhance}
              onCheckedChange={(v) => set("enhance", v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="pdfEnhance" className="font-normal leading-snug">
              ✨ AI-enhance card images 2× (~600 dpi) in the PDFs (card faces
              only, not plain backs)
            </Label>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasPacks || comparing}
            onClick={compare}
          >
            🔍 Compare on one card
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Sharper text and edges, using an AI upscaler that runs on your
          graphics card in this browser (downloads ~3 MB once). Slow: about 10
          seconds per card (≈2½ min per pack, ≈20 min for 8 packs), and PDFs get
          about 4× bigger. Best on photo paper, cardstock or a good laser
          printer.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <OffsetField
            id="backOffsetX"
            label="Move backs right (mm)"
            value={settings.backOffsetXMm}
            onChange={(v) => set("backOffsetXMm", v)}
          />
          <OffsetField
            id="backOffsetY"
            label="Move backs up (mm)"
            value={settings.backOffsetYMm}
            onChange={(v) => set("backOffsetYMm", v)}
          />
          <OffsetField
            id="backRotation"
            label="Turn backs (°)"
            value={settings.backRotationDeg}
            onChange={(v) => set("backRotationDeg", v)}
            step={ROTATION_STEP_DEG}
            limit={ROTATION_LIMIT_DEG}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={exporting}
            onClick={alignmentPrint}
            className="mb-0.5"
          >
            🎯 Alignment test print
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No printer puts the second side exactly behind the first, and the
          error only shows once you cut. These move the <b>backs</b> sheet to
          meet the fronts — the fronts carry the guides you cut to, so they
          stay put.
        </p>
        <p className="text-sm text-muted-foreground">
          The test print is two files, a front and a back, each named for the
          offsets it was made with. Print the front, turn the paper over the
          way your printer does, print the back, then hold the sheet to a
          light <b>with the fronts toward you</b>. The back&apos;s rulers are
          ticked every millimetre; measure from a ruler&apos;s middle to the
          front&apos;s cross and type that in, the way you are looking at it —
          if the cross sits to the right of the middle, the backs need to move
          right, so enter a positive number. Print it again to check: the
          offsets you have are built into it, so the second one is a check
          rather than another guess.
        </p>
        <p className="text-sm text-muted-foreground">
          <b>Turn backs</b> is for the error an offset cannot reach: a sheet
          that lines up at one end and is out at the other, which means the
          two sides went through at slightly different angles. Positive swings
          the bottom of the backs to the right and the top to the left. A
          tenth of a degree moves the bottom of the page about 0.3 mm, so this
          is a much smaller number than the offsets — if you need more than a
          degree, the paper is feeding crooked and the tray guides are the
          thing to fix.
        </p>
        <p className="text-sm text-muted-foreground">
          Which way round the printer turns the paper is already accounted
          for, so the numbers mean the same thing whichever flip you have
          chosen above.
        </p>
      </div>
    </div>
  );
}
