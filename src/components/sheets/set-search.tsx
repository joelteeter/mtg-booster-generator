"use client";

/*
 * Choosing any set at all, by typing.
 *
 * The booster pickers offer a dropdown of the hundred-odd sets a pack can be
 * built from. These pages have no such limit — a Commander deck, a Secret
 * Lair drop and a thirty-year-old core set all printed lands — and Scryfall
 * lists over a thousand sets, which is well past what a dropdown is for. So
 * it is a search box: type part of the name or the code, pick from what
 * matches.
 */
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { byNewest } from "@/lib/scryfall/sets";
import type { ScryfallSet } from "@/lib/scryfall/types";
import { cn } from "@/lib/utils";

/** Enough to choose from without turning the page into a list of sets. */
const SHOWN = 12;

export function matchSets(
  all: ScryfallSet[],
  query: string,
  limit = SHOWN,
): ScryfallSet[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);
  const exact = all.filter((s) => s.code.toLowerCase() === q);
  const rest = all.filter(
    (s) =>
      s.code.toLowerCase() !== q &&
      (s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)),
  );
  // An exact code first: "sld" means the Secret Lair Drop, not every set with
  // those three letters somewhere in its name.
  return [...exact, ...rest].slice(0, limit);
}

export function SetSearch({
  sets,
  value,
  onChange,
  label,
  hint,
}: {
  sets: ScryfallSet[];
  value: string;
  onChange: (code: string) => void;
  label: string;
  hint?: string;
}) {
  const [query, setQuery] = useState("");
  const ordered = useMemo(() => [...sets].sort(byNewest), [sets]);
  const matches = useMemo(() => matchSets(ordered, query), [ordered, query]);
  const chosen = useMemo(
    () => sets.find((s) => s.code === value) ?? null,
    [sets, value],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-sm">
        <Label htmlFor="setSearch">{label}</Label>
        <Input
          id="setSearch"
          value={query}
          placeholder="Name or code — Duskmourn, dsk, Secret Lair…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}

      <ul className="flex flex-wrap gap-1.5">
        {matches.map((s) => (
          <li key={s.code}>
            <button
              type="button"
              aria-pressed={s.code === value}
              onClick={() => onChange(s.code)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-left text-sm transition-colors",
                s.code === value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="font-medium">{s.name}</span>{" "}
              <span className="tabular-nums">
                ({s.code.toUpperCase()}
                {s.released_at ? `, ${s.released_at.slice(0, 4)}` : ""})
              </span>
            </button>
          </li>
        ))}
        {!matches.length && (
          <li className="text-sm text-muted-foreground">
            No set matches “{query}”.
          </li>
        )}
      </ul>

      {chosen && (
        <p className="text-sm text-muted-foreground">
          Chosen: <b>{chosen.name}</b> ({chosen.code.toUpperCase()})
          {chosen.card_count ? ` · ${chosen.card_count} cards` : ""}
          {chosen.released_at ? ` · released ${chosen.released_at}` : ""}
        </p>
      )}
    </div>
  );
}
