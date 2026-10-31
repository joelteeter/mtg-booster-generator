"use client";

/*
 * The slot table: one row per run of cards that is determined the same way.
 *
 * Rows that differ from the same set's vanilla odds are highlighted and carry a
 * callout naming the responsible options and every concrete change, so the
 * panel shows what the chosen options actually did rather than only which
 * option touches a slot.
 */
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Outcome, Slot, Stats } from "@/lib/booster/types";
import type { Pools } from "@/lib/booster/types";
import {
  describeChange,
  foilText,
  pct,
  poolNote,
  rarityClass,
  slotOptionNames,
  slotRange,
  taggedOutcomes,
  type ChangeDescription,
  type CollapsedChange,
  type ExplainOpts,
  type RarityKey,
} from "@/lib/explain";
import { cn } from "@/lib/utils";

/** Rarity chip colours, carried over from the old stylesheet. */
const RARITY_CLASS: Record<RarityKey, string> = {
  "r-common": "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
  "r-uncommon": "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-50",
  "r-rare": "bg-amber-200 text-amber-900 dark:bg-amber-700 dark:text-amber-50",
  "r-mythic": "bg-orange-200 text-orange-900 dark:bg-orange-700 dark:text-orange-50",
  "r-special": "bg-violet-200 text-violet-900 dark:bg-violet-700 dark:text-violet-50",
  "r-land": "bg-emerald-200 text-emerald-900 dark:bg-emerald-700 dark:text-emerald-50",
};

function ChangeLine({ change }: { change: CollapsedChange }) {
  const d: ChangeDescription = describeChange(change);
  switch (d.kind) {
    case "title":
      return (
        <div>
          now <b>{d.title}</b>{" "}
          <span className="font-normal opacity-70">(vanilla: {d.was})</span>
        </div>
      );
    case "added":
      return (
        <div>
          <b>{d.label}</b> added{d.at ? ` at ${d.at}` : ""}
        </div>
      );
    case "removed":
      return (
        <div>
          <b>{d.label}</b> removed{" "}
          <span className="font-normal opacity-70">(vanilla {d.was})</span>
        </div>
      );
    case "p":
      return (
        <div>
          <b>{d.label}</b> {d.from} → {d.to}{" "}
          <span
            className={
              d.direction === "up"
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }
          >
            {d.direction === "up" ? "▲" : "▼"}
          </span>
        </div>
      );
    case "foil":
      return (
        <div>
          {d.collapsed ? d.subject : <b>{d.subject}</b>} {d.from} → {d.to}
        </div>
      );
  }
}

function DiffTag({
  changes,
  slot,
  opts,
}: {
  changes: CollapsedChange[];
  slot: Slot;
  opts: ExplainOpts;
}) {
  if (!changes.length) return null;
  const who = slotOptionNames(slot, opts);
  return (
    <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
      <span className="mb-0.5 block font-bold">
        ✦ Differs from vanilla{who.length ? ` · ${who.join(", ")}` : ""}
      </span>
      {changes.map((c, i) => (
        <ChangeLine key={i} change={c} />
      ))}
    </div>
  );
}

function OutcomeRow({
  outcome,
  stats,
  pools,
}: {
  outcome: Outcome;
  stats: Stats | null;
  pools: Pools | null;
}) {
  const note = poolNote(outcome, stats, pools);
  // The formula is only interesting where the number is uncertain or partial.
  const showFormula =
    !!outcome.formula &&
    (outcome.p == null || (outcome.p > 0 && outcome.p < 1));
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <b className="min-w-[3.25rem]">
          {outcome.p == null ? "?" : pct(outcome.p)}
        </b>
        <span
          className={cn(
            "rounded px-1.5 text-[0.72rem] font-bold",
            RARITY_CLASS[rarityClass(outcome.label)],
          )}
        >
          {outcome.label}
        </span>
        {note.count != null && (
          <span className="text-xs text-muted-foreground">
            ({note.fellBackTo ? `none in set → ${note.fellBackTo}, ` : ""}
            {note.count} card{note.count === 1 ? "" : "s"}
            {note.mix ? `: ${note.mix}` : ""})
          </span>
        )}
      </div>
      {showFormula && (
        <div className="ml-[3.25rem] text-xs text-muted-foreground">
          {outcome.formula}
        </div>
      )}
    </div>
  );
}

export function SlotTable({
  slots,
  diffs,
  stats,
  pools,
  opts,
}: {
  slots: Slot[];
  diffs: CollapsedChange[][];
  stats: Stats | null;
  pools: Pools | null;
  opts: ExplainOpts;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Slot</TableHead>
            <TableHead>Card types</TableHead>
            <TableHead>Possible cards &amp; chance</TableHead>
            <TableHead>Foil</TableHead>
            <TableHead>List / Special</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots.map((slot, i) => {
            const changes = diffs[i] ?? [];
            const tags = taggedOutcomes(slot.outcomes);
            return (
              <TableRow
                key={`${slot.from}-${slot.title}`}
                className={cn(
                  "align-top",
                  changes.length &&
                    "bg-amber-50/60 dark:bg-amber-950/20 [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-amber-500)]",
                )}
              >
                <TableCell className="whitespace-nowrap font-bold">
                  {slotRange(slot)}
                  {slot.n > 1 && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {slot.n} cards
                    </div>
                  )}
                </TableCell>
                <TableCell className="min-w-[14rem]">
                  <strong>{slot.title}</strong>
                  <div className="text-xs text-muted-foreground">
                    {slot.types}
                  </div>
                  <DiffTag changes={changes} slot={slot} opts={opts} />
                </TableCell>
                <TableCell className="min-w-[16rem]">
                  {slot.outcomes.length ? (
                    <div className="flex flex-col gap-1">
                      {slot.outcomes.map((o, j) => (
                        <OutcomeRow
                          key={`${o.label}-${j}`}
                          outcome={o}
                          stats={stats}
                          pools={pools}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No cards available
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {foilText(slot.outcomes)}
                </TableCell>
                <TableCell>
                  {tags.length ? (
                    <div className="flex flex-col items-start gap-1">
                      {tags.map((t) => (
                        <span key={t.tag} className="whitespace-nowrap">
                          <Badge variant="secondary">{t.tag}</Badge>{" "}
                          {t.p == null ? "" : <b>{pct(t.p)}</b>}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
