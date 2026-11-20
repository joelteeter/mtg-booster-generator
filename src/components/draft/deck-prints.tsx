"use client";

/*
 * The admin's end of it: everybody's decks, as files to print.
 *
 * This is the step the feature exists for. Printing packs to draft in person
 * means printing every card and watching most of them go unplayed; printing
 * afterwards means a deck and five cards beside it — about a third of the
 * paper, and all of it gets used.
 *
 * One player is one row, which is how the page break falls between them:
 * `runExport` starts a new page per row, and a row here is a person rather
 * than a pack. Everything else is the Proxies page's machinery unchanged.
 *
 * It is also the first part of the draft that asks Scryfall anything. Picking
 * and building need only an image, and an image comes from an id; a decklist
 * needs names, set codes and collector numbers, which is one
 * `/cards/collection` request per seventy-five cards.
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ExportOptions } from "@/components/booster/export-options";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { client } from "@/hooks/use-scryfall";
import { saveAs } from "@/lib/download";
import {
  deckCards,
  decklistText,
  printFilenames,
  printIdentifiers,
  printRows,
  type Found,
} from "@/lib/draft-print";
import { runExport, type ExportKind } from "@/lib/export";
import type { DeckSheet, RoomView } from "@/lib/room";
import type { Card } from "@/lib/scryfall/types";
import { useExportStore } from "@/store/export";

/** Which set's basic lands to print: the one most of the draft came from. */
const commonSet = (cards: readonly Card[]): string | undefined => {
  const seen = new Map<string, number>();
  for (const card of cards)
    if (card.set) seen.set(card.set, (seen.get(card.set) ?? 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export function DeckPrints({
  view,
  adminKey,
}: {
  view: RoomView;
  adminKey: string;
}) {
  const [decks, setDecks] = useState<DeckSheet[] | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [withBasics, setWithBasics] = useState(false);
  const [loading, setLoading] = useState(false);

  const dfcMode = useExportStore((s) => s.settings.dfcMode);
  const exporting = useExportStore((s) => s.exporting);
  const status = useExportStore((s) => s.status);

  const basics = useMemo(() => ({ include: withBasics }), [withBasics]);

  const gather = useCallback(async () => {
    setLoading(true);
    try {
      const got = await fetchAll(view.code, adminKey);
      setDecks(got.decks);
      setFound(got.found);
      if (!got.decks.length)
        toast.error("Nobody has built a deck yet.");
    } catch (e) {
      toast.error("Could not fetch the decks.", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [view.code, adminKey]);

  const rows = useMemo(
    () => (decks && found ? printRows(decks, found, basics, dfcMode) : []),
    [decks, found, basics, dfcMode],
  );
  const base = useMemo(
    () => (decks ? printFilenames(view.code, decks) : []),
    [decks, view.code],
  );

  const run = useCallback(
    async (kind: ExportKind, idx: number) => {
      const store = useExportStore.getState();
      if (store.exporting) return;
      store.setExporting(true);
      try {
        await runExport({
          kind,
          idx,
          packs: rows,
          base,
          /*
           * Forced rather than taken from the setting: two people's decks
           * sharing a sheet of paper is never what the admin wanted, and
           * cutting them apart afterwards is somebody's evening.
           */
          settings: { ...store.settings, newPagePerPack: true },
          unit: "deck",
          onStatus: store.setStatus,
          save: saveAs,
        });
      } finally {
        useExportStore.getState().setExporting(false);
      }
    },
    [rows, base],
  );

  const copy = async (sheet: DeckSheet) => {
    if (!found) return;
    try {
      await navigator.clipboard.writeText(decklistText(sheet, found, basics));
      toast.success(`${sheet.name}'s decklist copied.`);
    } catch {
      toast.error("Could not copy it — it is on screen to select.");
    }
  };

  const waiting = view.roster.filter((p) => !p.submitted).length;

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-1 font-semibold">Print the decks</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        One file a player, each starting on a fresh sheet. Cards are looked up
        by their Scryfall id, so every printing is the one that was drafted.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={gather} disabled={loading}>
          {loading ? "Fetching…" : decks ? "Fetch again" : "Fetch the decks"}
        </Button>
        {waiting > 0 && (
          <span className="text-sm text-muted-foreground">
            {waiting} {waiting === 1 ? "player has" : "players have"} not
            handed one in yet.
          </span>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Switch
          id="draft-print-basics"
          checked={withBasics}
          onCheckedChange={setWithBasics}
        />
        <Label htmlFor="draft-print-basics">
          Print basic lands too
          <span className="ml-1 font-normal text-muted-foreground">
            — off, because most people own a pile of them
          </span>
        </Label>
      </div>

      {decks && found && decks.length > 0 && (
        <>
          <ul className="mb-4 flex flex-col gap-2">
            {decks.map((sheet) => {
              const cards = deckCards(sheet, found, basics);
              return (
                <li key={sheet.playerId}>
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm">
                      <b>{sheet.name}</b>
                      <span className="ml-2 text-muted-foreground">
                        seat {sheet.seat + 1} · {cards.length} cards to print
                        {sheet.submitted ? "" : " · still building"}
                      </span>
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs">
                      {decklistText(sheet, found, basics)}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => copy(sheet)}
                    >
                      Copy the decklist
                    </Button>
                  </details>
                </li>
              );
            })}
          </ul>

          <ExportOptions />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>PDF fronts</TableHead>
                <TableHead>PDF backs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: `All ${decks.length} decks` },
                ...decks.map((d) => ({ name: `${d.name} — seat ${d.seat + 1}` })),
              ].map((r, idx) => (
                <TableRow
                  key={r.name}
                  className={idx === 0 ? "bg-muted/60 font-semibold" : ""}
                >
                  <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                  {(
                    [
                      { kind: "pdf", label: "⬇ Fronts" },
                      { kind: "back", label: "⬇ Backs" },
                    ] as { kind: ExportKind; label: string }[]
                  ).map(({ kind, label }) => (
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
          <p className="mt-2 text-sm text-muted-foreground">{status}</p>
        </>
      )}
    </section>
  );
}

/**
 * The decks, and every card in them.
 *
 * Two rounds on purpose. The drafted cards come back first because they are
 * what says which set this draft was, and the basics are then asked for in
 * that set — a deck of Kamigawa commons with a Zendikar Forest in it would
 * print perfectly and look wrong on the table.
 */
async function fetchAll(
  code: string,
  adminKey: string,
): Promise<{ decks: DeckSheet[]; found: Found }> {
  const { fetchDecks } = await import("@/lib/room-client");
  const got = await fetchDecks(code, adminKey);
  const decks = got.decks.filter((d) => d.main.length || d.side.length);
  const found: Found = new Map();
  if (!decks.length) return { decks, found };

  const page = await client.collection(
    printIdentifiers(decks, { include: false }),
  );
  for (const card of page.data) found.set(card.id, card);

  const lands = printIdentifiers(decks, {
    include: true,
    set: commonSet(page.data),
  }).filter((id) => "name" in id);
  if (lands.length) {
    const got2 = await client.collection(lands);
    for (const card of got2.data) if (card.name) found.set(card.name, card);
  }
  return { decks, found };
}
