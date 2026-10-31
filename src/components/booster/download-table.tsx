/*
 * The downloads table.
 *
 * Phase 4 fills the CSV column; the PDF and MTGProxyPrinter columns are phase
 * 5 and are deliberately absent rather than present and dead. Row 0 is every
 * pack in one file, as in the old table.
 *
 * The object URL is made when the button is pressed and revoked a minute
 * later. The old code built one per row up front on every render, which leaked
 * a blob for every generation.
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
import { allPacksLabel, dfcCount, dfcNames, packName } from "@/lib/generate";
import { usePacksStore } from "@/store/packs";

function saveText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60000);
}

export function DownloadTable() {
  const packs = usePacksStore((s) => s.packs);
  const exportFiles = usePacksStore((s) => s.exportFiles);
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

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h2 className="text-sm font-medium">Downloads</h2>
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>CSV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow
                key={idx}
                className={r.all ? "bg-muted/60 font-semibold" : undefined}
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
                      saveText(
                        exportFiles.csv[idx],
                        `${exportFiles.base[idx]}.csv`,
                        "text/csv",
                      )
                    }
                  >
                    ⬇ CSV
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        <b>CSV:</b> Scryfall format; MTGProxyPrinter&apos;s CSV import merges
        duplicate cards, so pack order is lost there. The CSV lists each card
        once, as MTGProxyPrinter&apos;s import expects. The PDF pages and the
        MTGProxyPrinter save file come with the next phase; the old app still
        produces them.
      </p>
    </div>
  );
}
