"use client";

/*
 * The Lands and Tokens pages: pick a set, print its cards.
 *
 * One component for both, because they differ only in the search they run and
 * the words around it. What they share is everything that matters: the set
 * picker, the page layout, the print settings and the downloads, all of which
 * are the booster page's own.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { ExportOptions } from "@/components/booster/export-options";
import { SetSearch } from "@/components/sheets/set-search";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queries, useSets } from "@/hooks/use-scryfall";
import { CSV_HEADER, formatToFullCSV } from "@/lib/csv";
import { saveAs } from "@/lib/download";
import { runExport, type ExportKind } from "@/lib/export";
import {
  buildSheets,
  sheetCards,
  sheetFilenames,
  sheetQuery,
  tokenSetFor,
  type SheetKind,
} from "@/lib/sheets";
import { useExportStore } from "@/store/export";
import { useSheetsStore } from "@/store/sheets";

const WORDS: Record<
  SheetKind,
  { noun: string; blurb: string; pickLabel: string; hint: string }
> = {
  lands: {
    noun: "land",
    blurb:
      "Every land a set printed, laid out nine to a page. Packs give you a set's duals and utility lands a few at a time and never a basic, which is the one thing a draft cannot be played without. This prints the lot — a set, a Commander deck, a Secret Lair drop, anything Scryfall lists.",
    pickLabel: "Set to print the lands of",
    hint: "Any set: expansions, Commander decks, Secret Lair drops, old core sets.",
  },
  tokens: {
    noun: "token",
    blurb:
      "Every token a set printed, laid out nine to a page. A set's tokens live in a set of their own on Scryfall — “t” and the set's code, tdsk for Duskmourn — so pick the ordinary set and this finds them.",
    pickLabel: "Set to print the tokens of",
    hint: "Pick the normal set, not its token set; a token set works too if you know it.",
  },
};

export function SheetsUi({ kind }: { kind: SheetKind }) {
  const words = WORDS[kind];
  const { data: sets } = useSets();
  const code = useSheetsStore((s) => s.byKind[kind].code);
  const doubleSided = useSheetsStore((s) => s.byKind.tokens.doubleSided);
  const setCode = useSheetsStore((s) => s.setCode);
  const setDoubleSided = useSheetsStore((s) => s.setDoubleSided);
  const status = useExportStore((s) => s.status);
  const exporting = useExportStore((s) => s.exporting);
  const [busy, setBusy] = useState(false);

  const chosen = useMemo(
    () => (sets ?? []).find((s) => s.code === code) ?? null,
    [sets, code],
  );
  /* Tokens live in their own set; lands are in the set you picked. */
  const searchCode = chosen
    ? kind === "tokens"
      ? tokenSetFor(chosen)
      : chosen.code
    : "";

  const { data, isFetching, error } = useQuery({
    ...queries.search(searchCode ? sheetQuery(kind, searchCode) : "", "prints"),
    enabled: !!searchCode,
  });

  const cards = useMemo(() => (data ? sheetCards(data) : []), [data]);
  const sheets = useMemo(
    () => buildSheets(cards, kind, doubleSided),
    [cards, kind, doubleSided],
  );
  const base = useMemo(
    () => sheetFilenames(searchCode || "set", kind, sheets.length),
    [searchCode, kind, sheets.length],
  );

  /** The same CSV rows the booster downloads use, per sheet and for all. */
  const csv = useMemo(() => {
    const perSheet = sheets.map((sheet) =>
      sheet.flatMap((e) =>
        [formatToFullCSV(e.card, "nonfoil")].concat(
          e.backCard ? [formatToFullCSV(e.backCard, "nonfoil")] : [],
        ),
      ),
    );
    return [perSheet.flat(), ...perSheet].map((rows) =>
      [CSV_HEADER, ...rows].join("\n"),
    );
  }, [sheets]);

  const run = useCallback(
    async (exportKind: ExportKind, idx: number) => {
      const store = useExportStore.getState();
      if (store.exporting) return;
      store.setExporting(true);
      setBusy(true);
      try {
        await runExport({
          kind: exportKind,
          idx,
          packs: sheets,
          base,
          settings: store.settings,
          onStatus: store.setStatus,
          save: saveAs,
        });
      } finally {
        useExportStore.getState().setExporting(false);
        setBusy(false);
      }
    },
    [sheets, base],
  );

  const rows = [
    { name: `All ${sheets.length} page${sheets.length === 1 ? "" : "s"}` },
    ...sheets.map((_, i) => ({ name: `Page ${i + 1}` })),
  ];
  const kinds: Array<{ kind: ExportKind; label: string }> = [
    { kind: "pdf", label: "⬇ Fronts" },
    { kind: "back", label: "⬇ Backs" },
    { kind: "mpp", label: "⬇ .mtgproxies" },
  ];

  return (
    <>
      <p className="text-sm text-muted-foreground">{words.blurb}</p>

      <SetSearch
        sets={sets ?? []}
        value={code}
        onChange={(c) => setCode(kind, c)}
        label={words.pickLabel}
        hint={words.hint}
      />

      {kind === "tokens" && (
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="tokensDoubleSided"
            checked={doubleSided}
            onCheckedChange={(v) => setDoubleSided(v === true)}
          />
          <Label htmlFor="tokensDoubleSided" className="font-normal">
            Two tokens per card, one on each side (halves the paper; print
            double-sided)
          </Label>
        </div>
      )}

      {searchCode && (
        <p aria-live="polite" className="text-sm">
          {isFetching
            ? `⏳ Loading ${searchCode.toUpperCase()}…`
            : error
              ? `❌ ${(error as Error).message}`
              : cards.length
                ? `✅ ${cards.length} ${words.noun}${cards.length === 1 ? "" : "s"} in ${searchCode.toUpperCase()}, one per artwork — ${sheets.length} page${sheets.length === 1 ? "" : "s"} of nine.`
                : `No ${words.noun}s found in ${searchCode.toUpperCase()}.`}
        </p>
      )}

      {cards.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            What is on the pages
          </summary>
          <ol className="mt-2 grid gap-x-4 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <li key={c.id}>
                {c.name}{" "}
                <span className="tabular-nums">#{c.collector_number}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {sheets.length > 0 && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <h2 className="text-sm font-medium">Downloads</h2>
          <ExportOptions />
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
                <TableRow key={idx} className={idx === 0 ? "bg-muted/60 font-semibold" : ""}>
                  <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() =>
                        saveAs(csv[idx], `${base[idx]}.csv`, "text/csv")
                      }
                    >
                      ⬇ CSV
                    </Button>
                  </TableCell>
                  {kinds.map(({ kind: k, label }) => (
                    <TableCell key={k}>
                      <Button
                        size="sm"
                        disabled={exporting || busy}
                        onClick={() => run(k, idx)}
                      >
                        {label}
                      </Button>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p
            aria-live="polite"
            className="min-h-5 text-sm font-medium text-primary"
          >
            {status}
          </p>
        </div>
      )}
    </>
  );
}
