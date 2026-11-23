"use client";

/*
 * The summary of everything that deviates from the official layout, above the
 * table. Each item names its slot; the table itself highlights the same rows.
 *
 * The wording is `lib/explain`'s, not this file's: the draft room says the
 * same thing to players who never saw this page, and one implementation means
 * the two cannot describe a change differently.
 */
import type { Slot } from "@/lib/booster/types";
import {
  GUEST_CHANGE,
  vanillaChanges,
  type CollapsedChange,
} from "@/lib/explain";
import { cn } from "@/lib/utils";

export function VanillaDiff({
  slots,
  diffs,
  diffCount,
  guest,
}: {
  slots: Slot[];
  diffs: CollapsedChange[][];
  diffCount: number;
  guest: boolean;
}) {
  const items = vanillaChanges(slots, diffs);

  const same = !items.length && !guest;

  return (
    <div
      className={cn(
        "my-3 rounded border border-l-4 px-3 py-2 text-sm",
        same
          ? "border-green-200 border-l-green-600 bg-green-50 dark:border-green-900 dark:border-l-green-500 dark:bg-green-950/40"
          : "border-amber-200 border-l-amber-500 bg-amber-50 dark:border-amber-900 dark:border-l-amber-500 dark:bg-amber-950/40",
      )}
    >
      {same ? (
        <>
          <b>✓ No differences from vanilla</b>
          <span className="text-muted-foreground">
            {" "}
            — the options chosen leave every slot at its official odds for this
            set.
          </span>
        </>
      ) : (
        <>
          <b>
            ✦ {diffCount || "No"} change{diffCount === 1 ? "" : "s"} from vanilla
          </b>
          <span className="text-muted-foreground">
            {" "}
            — highlighted in the table below
          </span>
          <ul className="mt-1.5 list-disc pl-5">
            {items.map((it) => (
              <li key={it.key} className="mb-0.5">
                <b>Slot {it.slot}</b> ({it.title}): {it.text}
              </li>
            ))}
            {guest && (
              <li className="mb-0.5">{GUEST_CHANGE}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
