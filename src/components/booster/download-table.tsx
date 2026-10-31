/*
 * The downloads table: CSV, PDF fronts, PDF backs and an MTGProxyPrinter save
 * file, for every pack in one file or for one pack at a time.
 *
 * Row 0 is everything together, as in the old table, and a row carries a badge
 * naming its double-faced cards, because those are what the "Double-faced
 * cards" print setting is about.
 *
 * One export runs at a time and disables the buttons while it does, which is
 * what the old code's `exporting` flag did: the image cache and the single-GPU
 * upscale queue are shared, so two at once would only take turns anyway.
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExport } from "@/hooks/use-export";
import { saveAs } from "@/lib/download";
import { allPacksLabel, dfcCount, dfcNames, packName } from "@/lib/generate";
import { cn } from "@/lib/utils";
import { useExportStore } from "@/store/export";
import { usePacksStore } from "@/store/packs";

import { ExportOptions } from "./export-options";

export function DownloadTable() {
  const packs = usePacksStore((s) => s.packs);
  const exportFiles = usePacksStore((s) => s.exportFiles);
  const status = useExportStore((s) => s.status);
  const { run, exporting } = useExport();
  if (!packs.length || !exportFiles) return null;

  const totalDfc = packs.reduce((a, p) => a + dfcCount(p), 0);
  const rows = [
    {
      name: allPacksLabel(packs),
      dfc: totalDfc,
      title: `${totalDfc} double-faced card(s) across all packs`,
      all: true,
    },
    ...packs.map((p, i) => ({
      name: packName(p, i),
      dfc: dfcCount(p),
      title: dfcNames(p),
      all: false,
    })),
  ];

  const kinds = [
    { kind: "pdf" as const, label: "⬇ Fronts" },
    { kind: "back" as const, label: "⬇ Backs" },
    { kind: "mpp" as const, label: "⬇ .mtgproxies" },
  ];

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <h2 className="text-sm font-medium">Downloads</h2>
      <ExportOptions />
      {/* shadcn's Table brings its own `overflow-x-auto` container. */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>CSV</TableHead>
            <TableHead>PDF fronts</TableHead>
            <TableHead>PDF backs</TableHead>
            <TableHead>MTGProxyPrinter</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow
              key={idx}
              className={cn(
                r.all && "bg-muted/60 font-semibold",
                // The old table marked these rows with a left edge.
                r.dfc > 0 && "border-l-2 border-l-primary",
              )}
            >
              <TableCell className="whitespace-nowrap">
                {r.name}
                {r.dfc > 0 && (
                  <Badge
                    variant="secondary"
                    title={r.title}
                    className="ml-2 whitespace-normal font-normal"
                  >
                    ⟲ {r.dfc} double-faced
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  onClick={() =>
                    saveAs(
                      exportFiles.csv[idx],
                      `${exportFiles.base[idx]}.csv`,
                      "text/csv",
                    )
                  }
                >
                  ⬇ CSV
                </Button>
              </TableCell>
              {kinds.map(({ kind, label }) => (
                <TableCell key={kind}>
                  <Button
                    size="sm"
                    disabled={exporting}
                    onClick={() => run(kind, idx)}
                  >
                    {label}
                  </Button>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p aria-live="polite" className="min-h-5 text-sm font-medium text-primary">
        {status}
      </p>
      <p className="text-sm text-muted-foreground">
        <b>CSV:</b> Scryfall format; MTGProxyPrinter&apos;s CSV import merges
        duplicate cards, so pack order is lost there.{" "}
        <b>PDF fronts:</b> 3×3 cards at 63×88 mm; rounded corners are filled
        from the pixels next to them, the outer bleed stretches each
        card&apos;s edge pixels outward, inverted-colour crosshairs mark every
        card corner for cutting, and short crop marks bracket the outside
        corners of the page.{" "}
        <b>PDF backs:</b> same pages as the fronts PDF with every position
        mirrored, so printing it on the back of the fronts puts each back behind
        its card. Use the same paper, bleed and &ldquo;new page&rdquo; settings
        for both. With &ldquo;front only&rdquo; double-faced cards, the cut
        marks are printed on the backs only.{" "}
        <b>MTGProxyPrinter:</b> a <code>.mtgproxies</code> document; open it with
        File → Open to print every card in pack order with your own
        MTGProxyPrinter settings (it follows the double-faced card setting too).
        The CSV lists each card once, as MTGProxyPrinter&apos;s import expects.
      </p>
    </div>
  );
}
