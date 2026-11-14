"use client";

/*
 * The Proxies page: paste a decklist, print those cards.
 *
 * Every other page in the app decides what to print — slot odds, a set's
 * lands, a set's tokens. This one is told, which makes it the simplest page
 * here and the one with the most to report: a pasted list is often a little
 * wrong, and the honest thing is to print what it can and say exactly where
 * it departed from what was asked for.
 *
 * The lookup runs on a button rather than as you type. A hundred-line list
 * would otherwise go to Scryfall on every keystroke, and pasting is a single
 * deliberate act that deserves a single deliberate request.
 */
import { useCallback, useMemo, useState } from "react";

import { ExportOptions } from "@/components/booster/export-options";
import { PreviewDeck } from "@/components/booster/pack-preview";
import { SetSearch } from "@/components/sheets/set-search";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { client, useSets } from "@/hooks/use-scryfall";
import { saveAs } from "@/lib/download";
import { runExport, type ExportKind } from "@/lib/export";
import {
  mostRecentSet,
  noteText,
  parseProxyList,
  proxyEntries,
  proxyFilenames,
  proxyPages,
  resolveProxyList,
  type ProxyCard,
} from "@/lib/proxies";
import { useExportStore } from "@/store/export";

const EXAMPLE = `1 The Borg Queen (TRC) 1
1 Academy Ruins (TRC) 512
1 An Offer You Can't Refuse (SLD) 2618
1 Arc Reactor (MSH) 243`;

export function ProxiesUi() {
  const { data: sets } = useSets();
  const dfcMode = useExportStore((s) => s.settings.dfcMode);
  const status = useExportStore((s) => s.status);
  const exporting = useExportStore((s) => s.exporting);

  const [text, setText] = useState("");
  const [setCode, setSetCode] = useState("");
  const [resolved, setResolved] = useState<ProxyCard[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const codes = useMemo(() => (sets ?? []).map((s) => s.code), [sets]);
  const parsed = useMemo(() => parseProxyList(text, codes), [text, codes]);
  const newest = useMemo(() => mostRecentSet(sets ?? []), [sets]);
  /* The picker wins; the newest released set is the fallback. */
  const fallbackSet = setCode || newest?.code || "";
  const noSetLines = parsed.lines.filter((l) => !l.set).length;

  const lookUp = useCallback(async () => {
    setLooking(true);
    setFailed("");
    try {
      setResolved(
        await resolveProxyList(parseProxyList(text, codes), fallbackSet, {
          collection: (ids, signal) => client.collection(ids, signal),
        }),
      );
      setPreviewIndex(0);
    } catch (e) {
      console.error(e);
      setResolved(null);
      setFailed((e as Error).message);
    } finally {
      setLooking(false);
    }
  }, [text, codes, fallbackSet]);

  /*
   * Faces are split here and not in the exporter, so the page you pick in the
   * table is the page you saw in the preview — see `lib/proxies/pages.ts`.
   */
  const entries = useMemo(
    () => (resolved ? proxyEntries(resolved, dfcMode) : []),
    [resolved, dfcMode],
  );
  const pages = useMemo(() => proxyPages(entries), [entries]);
  const base = useMemo(() => proxyFilenames(pages.length), [pages.length]);

  const missing = (resolved ?? []).filter((r) => !r.card);
  const noted = (resolved ?? []).filter((r) => r.card && r.notes.length);
  const found = (resolved ?? []).filter((r) => r.card);

  const run = useCallback(
    async (kind: ExportKind, idx: number) => {
      const store = useExportStore.getState();
      if (store.exporting) return;
      store.setExporting(true);
      try {
        await runExport({
          kind,
          idx,
          packs: pages,
          base,
          settings: store.settings,
          unit: "page",
          onStatus: store.setStatus,
          save: saveAs,
        });
      } finally {
        useExportStore.getState().setExporting(false);
      }
    },
    [pages, base],
  );

  const rows = [
    { name: `All ${pages.length} page${pages.length === 1 ? "" : "s"}` },
    ...pages.map((_, i) => ({ name: `Page ${i + 1}` })),
  ];
  const kinds: Array<{ kind: ExportKind; label: string }> = [
    { kind: "pdf", label: "⬇ Fronts" },
    { kind: "back", label: "⬇ Backs" },
  ];

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Paste a list of cards and print those exact cards, nine to a page. One
        line per card, in the shape every deck site exports:{" "}
        <code>1 Academy Ruins (TRC) 512</code> — how many, the name, the set in
        brackets, the collector number. A quantity of four prints four copies.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="proxyList" className="text-sm font-medium">
          The cards to print
        </Label>
        <Textarea
          id="proxyList"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          rows={12}
          className="font-mono text-sm"
        />
        <p className="text-sm text-muted-foreground">
          Set and collector number name one printing exactly, and that is what
          gets printed. Both are optional: <code>4x Sol Ring</code> and a bare
          name work too, and the brackets are optional as well —{" "}
          <code>6 forest neo 302</code> reads the same. So do{" "}
          <code>{"//"}</code> comments and the
          Deck/Sideboard/Commander headings an export writes between its
          sections.
        </p>
      </div>

      <SetSearch
        sets={sets ?? []}
        value={setCode}
        onChange={setSetCode}
        label="Set to assume for lines with no set"
        hint={
          newest
            ? `Only used by lines that name no set. Left empty, that is the newest released set — ${newest.name} (${newest.code.toUpperCase()}).`
            : "Only used by lines that name no set."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={lookUp} disabled={!parsed.lines.length || looking}>
          {looking ? "⏳ Looking up…" : "🔍 Look up these cards"}
        </Button>
        <Button
          variant="secondary"
          disabled={!text || looking}
          onClick={() => {
            setText("");
            setResolved(null);
            setFailed("");
          }}
        >
          Clear
        </Button>
        {parsed.lines.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {parsed.lines.length} line{parsed.lines.length === 1 ? "" : "s"},{" "}
            {parsed.total} card{parsed.total === 1 ? "" : "s"}
            {noSetLines > 0 &&
              ` · ${noSetLines} with no set, assuming ${(fallbackSet || "—").toUpperCase()}`}
          </span>
        )}
      </div>

      {(parsed.bad.length > 0 || failed || resolved) && (
        <p aria-live="polite" className="text-sm">
          {failed ? (
            `❌ ${failed}`
          ) : resolved ? (
            <>
              {`✅ ${found.length} of ${parsed.lines.length} line${parsed.lines.length === 1 ? "" : "s"} found — ${entries.length} card${entries.length === 1 ? "" : "s"} on ${pages.length} page${pages.length === 1 ? "" : "s"}.`}
              {(missing.length > 0 || noted.length > 0 || parsed.bad.length > 0) && (
                <span className="text-muted-foreground">
                  {" "}
                  {missing.length > 0 && `${missing.length} not found. `}
                  {noted.length > 0 && `${noted.length} not quite as asked. `}
                  {parsed.bad.length > 0 && `${parsed.bad.length} unreadable.`}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {parsed.bad.length} line{parsed.bad.length === 1 ? "" : "s"} could
              not be read.
            </span>
          )}
        </p>
      )}

      {(parsed.bad.length > 0 || missing.length > 0 || noted.length > 0) && (
        <details className="rounded-lg border p-3" open>
          <summary className="cursor-pointer text-sm font-medium">
            Lines to look at
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {parsed.bad.map((b) => (
              <li key={`bad-${b.line}`}>
                <span className="tabular-nums text-muted-foreground">
                  line {b.line}
                </span>{" "}
                <code>{b.raw}</code>{" "}
                <span className="text-muted-foreground">— {b.why}</span>
              </li>
            ))}
            {[...missing, ...noted]
              .sort((a, b) => a.line.line - b.line.line)
              .map((r) => (
                <li key={`note-${r.line.line}`}>
                  <span className="tabular-nums text-muted-foreground">
                    line {r.line.line}
                  </span>{" "}
                  <code>{r.line.raw}</code>{" "}
                  <span className="text-muted-foreground">
                    — {r.notes.map(noteText).join("; ")}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

      <PreviewDeck
        pages={pages}
        open={previewOpen}
        index={previewIndex}
        onToggle={() => setPreviewOpen((o) => !o)}
        onShow={setPreviewIndex}
        labelFor={(page, i) => `Page ${i + 1} (${page.length} cards)`}
        showLabel="👁 Preview the pages"
        hideLabel="🙈 Hide preview"
      />

      {pages.length > 0 && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <h2 className="text-sm font-medium">Downloads</h2>
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
              {rows.map((r, idx) => (
                <TableRow
                  key={idx}
                  className={idx === 0 ? "bg-muted/60 font-semibold" : ""}
                >
                  <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                  {kinds.map(({ kind: k, label }) => (
                    <TableCell key={k}>
                      <Button
                        size="sm"
                        disabled={exporting}
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
          {status && (
            <p aria-live="polite" className="text-sm">
              {status}
            </p>
          )}
        </div>
      )}
    </>
  );
}
