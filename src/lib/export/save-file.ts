/*
 * The MTGProxyPrinter save file.
 *
 * A `.mtgproxies` document is an SQLite database in MTGProxyPrinter's
 * "document-v7" format. Writing one keeps every card in the page and slot this
 * app chose, which MTGProxyPrinter's CSV import cannot: that merges duplicate
 * cards and loses pack order.
 *
 * SQLite runs in the browser through sql.js, which is WebAssembly. The old app
 * fetched both the loader and the `.wasm` from jsDelivr; here sql.js is a
 * dependency and the `.wasm` is served from this site, so the one export that
 * is not optional does not depend on a third-party CDN being up. The loader is
 * still a dynamic import, so nothing of it is downloaded until someone asks
 * for a save file.
 */
import type { SqlJsStatic } from "sql.js";

import type { PackEntry } from "@/lib/generate";

import { expandFaces, layoutPages, type DfcMode } from "./layout";
import { loadScript, ownUrl } from "./load-script";
import { CARD_PX, PER_PAGE } from "./paper";
import { SCHEMA_V7 } from "./schema-v7";

/** Both files are copied in by `scripts/copy-sql-wasm.mjs`. */
const SQL_LOADER = "sql-wasm.js";

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Loads sql.js once, and lets a failed load be retried. */
export function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = loadScript(ownUrl(SQL_LOADER))
      .then(() =>
        (window as unknown as { initSqlJs: InitSqlJs }).initSqlJs({
          locateFile: (f) => ownUrl(f),
        }),
      )
      .catch((e: Error) => {
        sqlPromise = null;
        throw e;
      });
  }
  return sqlPromise;
}

type InitSqlJs = (config: {
  locateFile: (file: string) => string;
}) => Promise<SqlJsStatic>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface SaveFileOptions {
  newPagePerPack?: boolean;
  dfcMode?: DfcMode;
  perPage?: number;
  /** For the parity harness, which hands both implementations one sql.js. */
  sql?: SqlJsStatic;
}

export async function buildSaveFile(
  packs: PackEntry[][],
  opts: SaveFileOptions = {},
): Promise<Uint8Array> {
  const SQL = opts.sql ?? (await getSql());
  const db = new SQL.Database();
  try {
    db.exec(SCHEMA_V7);
    const pages = layoutPages(
      expandFaces(packs, opts.dfcMode || "separate"),
      !!opts.newPagePerPack,
      opts.perPage || PER_PAGE,
    );
    const addPage = db.prepare(
      "INSERT INTO Page (page, image_size) VALUES (?, ?)",
    );
    const addCard = db.prepare(
      "INSERT INTO Card (page, slot, is_front, type, scryfall_id) VALUES (?, ?, ?, 'r', ?)",
    );
    db.exec("BEGIN");
    pages.forEach((page, p) => {
      addPage.run([p + 1, `${CARD_PX.w}x${CARD_PX.h}`]);
      page.forEach((entry, s) => {
        const id = String(entry.card.id || "").toLowerCase();
        if (!UUID.test(id)) {
          throw new Error(
            `"${entry.card.name}" has no Scryfall ID, so MTGProxyPrinter can't look it up`,
          );
        }
        addCard.run([p + 1, s + 1, entry.face === 1 ? 0 : 1, id]);
      });
    });
    db.exec("COMMIT");
    addPage.free();
    addCard.free();
    return db.export();
  } finally {
    db.close();
  }
}
