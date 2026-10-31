"use client";

/*
 * The summary of everything that deviates from the official layout, above the
 * table. Each item names its slot; the table itself highlights the same rows.
 */
import type { Slot } from "@/lib/booster/types";
import { describeChange, slotRange, type CollapsedChange } from "@/lib/explain";
import { cn } from "@/lib/utils";

function changeSentence(change: CollapsedChange): string {
  const d = describeChange(change);
  switch (d.kind) {
    case "title":
      return `now ${d.title} (vanilla: ${d.was})`;
    case "added":
      return `${d.label} added${d.at ? ` at ${d.at}` : ""}`;
    case "removed":
      return `${d.label} removed (vanilla ${d.was})`;
    case "p":
      return `${d.label} ${d.from} → ${d.to} ${d.direction === "up" ? "▲" : "▼"}`;
    case "foil":
      return `${d.subject} ${d.from} → ${d.to}`;
  }
}

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
  const items = slots
    .map((s, i) =>
      diffs[i]?.length
        ? {
            key: `${s.from}-${s.title}`,
            slot: slotRange(s),
            title: s.title,
            text: diffs[i].map(changeSentence).join("; "),
          }
        : null,
    )
    .filter((x): x is NonNullable<typeof x> => x !== null);

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
              <li className="mb-0.5">
                {/*
                 * The Guest List swap changes which printing is used after a
                 * card is drawn, so it never shows up as a change to a slot's
                 * odds — but it is still a deviation worth naming.
                 */}
                <b>Every slot:</b> a drawn card that has a Special Guests
                printing is swapped to it 50% of the time — this changes the
                printing, not which card fills the slot, so none of the chances
                above move.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
