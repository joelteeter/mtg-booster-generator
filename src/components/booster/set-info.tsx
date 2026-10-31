"use client";

/*
 * The one-line summary of the chosen set: its name, whether it is out, and the
 * unique card names in each pool.
 */
import { COMMANDER_SETS, isReleased } from "@/lib/booster";
import type { NameMap } from "@/lib/booster/types";
import { useSetsByCode } from "@/hooks/use-scryfall";
import { useSpec } from "@/hooks/use-spec";

export function SetInfo() {
  const { code, mode, pools, loading, error } = useSpec();
  const setsByCode = useSetsByCode();

  if (!code) return null;
  if (error)
    return (
      <p className="text-sm text-destructive">❌ {error.message}</p>
    );
  if (!pools)
    return (
      <p className="text-sm text-muted-foreground">
        {loading
          ? `⏳ Loading ${code.toUpperCase()} card pools…`
          : `⏳ Loading ${code.toUpperCase()} card pools…`}
      </p>
    );

  const meta = setsByCode.get(code) ?? COMMANDER_SETS[code];
  const name = meta ? meta.name : code.toUpperCase();
  const rel = meta
    ? ((meta as { released_at?: string; released?: string }).released_at ??
      (meta as { released?: string }).released ??
      "")
    : "";
  const c = (k: string) => {
    const pool = (pools as Record<string, NameMap | undefined>)[k];
    return pool instanceof Map ? pool.size : 0;
  };

  const counts =
    mode === "play"
      ? `${c("commons")} commons · ${c("uncommons")} uncommons · ${c("rares")} rares · ${c("mythics")} mythics · ${c("nonBasicLands")} non-basic lands`
      : `${c("commons")} C · ${c("uncommons")} U · ${c("rares")} R · ${c("mythics")} M in regular slots · ${c("legAll")} legends (${c("legC")} C · ${c("legU")} U · ${c("legR")} R · ${c("legM")} M)` +
        (c("bgCU") + c("bgR")
          ? ` · ${c("bgCU") + c("bgR")} backgrounds`
          : "");

  const out = isReleased(meta ? { ...meta, released_at: rel } : { released_at: rel });

  return (
    <p className="text-sm text-muted-foreground">
      {out ? "✅" : "🔜"} {name}
      {rel ? ` (${out ? rel : "not out until " + rel})` : ""}: {counts} (unique
      card names)
    </p>
  );
}
