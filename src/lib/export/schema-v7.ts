/*
 * MTGProxyPrinter's save-file schema, used unchanged so the files this app
 * writes pass MTGProxyPrinter's own schema check.
 *
 * This is `document-v7.sql` from MTGProxyPrinter
 * (Copyright © 2020-2026 Thomas Hess, GPL-3.0-or-later), copied verbatim.
 * Do not reformat it: a changed byte here is a file MTGProxyPrinter refuses.
 */
export const SCHEMA_V7 = `PRAGMA user_version = 7;
PRAGMA application_id = 41325044; -- ASCII-encoded "MTGP"
PRAGMA page_size =  512;
VACUUM;  -- Required to apply setting PRAGMA page_size
CREATE TABLE CustomCardData (
  -- Holds custom cards. The original file path is not retained.
  -- The path may contain sensitive information and is not portable.
  card_id TEXT NOT NULL PRIMARY KEY CHECK (card_id GLOB '[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]'),
  image BLOB NOT NULL,  -- The raw image content
  name TEXT NOT NULL DEFAULT '',
  set_name TEXT NOT NULL DEFAULT '',
  set_code TEXT NOT NULL DEFAULT '',
  collector_number TEXT NOT NULL DEFAULT '',
  is_front BOOLEAN_INTEGER NOT NULL CHECK (is_front IN (TRUE, FALSE)) DEFAULT TRUE,
  other_face TEXT REFERENCES CustomCardData(card_id)  -- If this is a DFC, this references the other side
);
CREATE TABLE Page (
  page INTEGER NOT NULL PRIMARY KEY CHECK (page > 0),
  image_size TEXT NOT NULL CHECK(image_size <> '')
);
CREATE TABLE Card (
  page INTEGER NOT NULL CHECK (page > 0) REFERENCES Page(page),
  slot INTEGER NOT NULL CHECK (slot > 0),
  is_front BOOLEAN_INTEGER NOT NULL CHECK (is_front IN (TRUE, FALSE)),
  type TEXT NOT NULL CHECK (type <> ''),
  scryfall_id TEXT CHECK (scryfall_id GLOB '[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]'),
  custom_card_id TEXT REFERENCES CustomCardData(card_id) DEFAULT NULL,
  PRIMARY KEY(page, slot),
  CONSTRAINT "Card slot must not refer to both an official and custom card" CHECK ((scryfall_id IS NULL) OR (custom_card_id IS NULL))
) WITHOUT ROWID;
CREATE TABLE DocumentSettings (
  -- Non-numerical document settings
  "key" TEXT NOT NULL PRIMARY KEY CHECK (typeof("key") == 'text' and "key" <> ''),
  value TEXT NOT NULL CHECK (typeof(value) == 'text')
) WITHOUT ROWID;
CREATE TABLE DocumentDimensions (
  -- Numerical document settings. Values are stored as texts including units, for example '12 mm'
  -- Type contains Quantity, which is used to register an automatic conversion method to pint.Quantity
  "key" TEXT NOT NULL PRIMARY KEY CHECK (typeof("key") == 'text' and "key" <> ''),
  value TEXT_QUANTITY NOT NULL CHECK (typeof(value) == 'text' and value <> '')
) WITHOUT ROWID;`;
