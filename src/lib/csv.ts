/*
 * CSV rows in Scryfall's CSV format, which is what MTGProxyPrinter imports.
 *
 * Ported from `js/csv.js`. Nothing is quoted or escaped beyond what the old
 * code did: fields that can contain a comma are wrapped in double quotes, and
 * a card name containing a double quote would still break the row. That is a
 * real limitation, but no Magic card name contains one, and changing the
 * quoting would change every file the app has ever produced.
 */
import type { Card } from "@/lib/scryfall/types";

/** The column order MTGProxyPrinter's CSV import expects. */
export const CSV_HEADER =
  "section,count,name,mana_cost,type,set,set_code,collector_number,lang," +
  "rarity,artist,finish,usd_price,eur_price,tix_price,scryfall_uri,scryfall_id";

/** A finish is normally the string, but the old code also accepted a boolean. */
export type Finish = string | boolean;

const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * One CSV row for one printing.
 *
 * `manualSection` overrides the land/nonland split, which the separator rows
 * use: a bonus land carries its own column marker from the built-in pool.
 */
export function formatToFullCSV(
  card: Card,
  finish: Finish = "nonfoil",
  manualSection: string | null = null,
): string {
  if (finish === true) finish = "foil";
  if (finish === false) finish = "nonfoil";
  const section =
    manualSection ||
    (card.type_line && card.type_line.toLowerCase().includes("land")
      ? "lands"
      : "nonlands");
  // Double-faced cards carry the cost on their faces, joined as Scryfall does.
  const manaCost =
    card.mana_cost ??
    (card.card_faces
      ? card.card_faces.map((f) => f.mana_cost || "").join(" // ")
      : "");
  return [
    section,
    1,
    `"${card.name}"`,
    `"${manaCost || ""}"`,
    `"${card.type_line || ""}"`,
    `"${card.set_name || ""}"`,
    card.set || "",
    `"${card.collector_number || ""}"`,
    str(card.lang) || "en",
    card.rarity || "",
    `"${card.artist || ""}"`,
    finish,
    // The built-in bonus lands carry flat price fields; Scryfall nests them.
    str(card.usd || card.prices?.usd || ""),
    str(card.eur || card.prices?.eur || ""),
    str(card.tix || card.prices?.tix || ""),
    str(card.scryfall_uri || card.uri || ""),
    card.id || "",
  ].join(",");
}
