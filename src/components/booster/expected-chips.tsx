"use client";

/** Per-pack expectations under the slot table. Empty while the set loads. */
import type { ExpectedChip } from "@/lib/explain";

export function ExpectedChips({ chips }: { chips: ExpectedChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="my-3 flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className="rounded-md bg-muted px-2.5 py-1 text-sm"
        >
          {c.label}: <b>{c.value.toFixed(2)}</b> per pack
        </span>
      ))}
    </div>
  );
}
