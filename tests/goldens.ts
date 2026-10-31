/*
 * Recorded answers from the old app.
 *
 * Phase 6 deleted `js/`, and with it the second implementation every parity
 * test compared against. These files are what is left of it: the old app's
 * own output for each case, written down on its last day, so the sweeps that
 * proved the port keep working as ordinary regression tests.
 *
 * They are compared as text rather than as objects on purpose. A spec rendered
 * one line per slot and one per outcome diffs readably, which an object dump
 * does not, and the same matrix costs a third of the bytes. Numbers are
 * written with `String`, which round-trips exactly, so this is a comparison of
 * values and not of a rounded rendering of them.
 *
 * Format: `## key` lines name the case, and the lines after them are its
 * recorded value. Several `##` lines in a row share the body that follows —
 * most cases produce one of a few hundred distinct specs, and the sharing is
 * both the reason these files are small and a useful thing to see. A case with
 * no output records the single line `(none)`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EMPTY = "(none)";

export function readGolden(name: string): Map<string, string> {
  const text = readFileSync(
    fileURLToPath(new URL(`./golden/${name}.txt`, import.meta.url)),
    "utf8",
  );
  const out = new Map<string, string>();
  let keys: string[] = [];
  let body: string[] = [];
  const flush = () => {
    if (!keys.length) return;
    const value = body.join("\n");
    for (const k of keys) out.set(k, value === EMPTY ? "" : value);
    keys = [];
    body = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("#!") || line.startsWith("# ") || line === "#") continue;
    if (line.startsWith("## ")) {
      if (body.length) flush();
      keys.push(line.slice(3));
    } else if (line.trim()) {
      body.push(line);
    }
  }
  flush();
  return out;
}

/** Reads one case, failing loudly rather than comparing against `undefined`. */
export function golden(file: Map<string, string>, key: string): string {
  const value = file.get(key);
  if (value === undefined) {
    throw new Error(
      `no recorded value for "${key}". The old app is gone, so this cannot be ` +
        `re-recorded: either the key changed, or the case is new and needs an ` +
        `expectation written by hand.`,
    );
  }
  return value;
}

/** Serialises a recording back out. Used by the one-off recorders only. */
export function formatGolden(
  header: string[],
  entries: Array<[string, string]>,
): string {
  const byValue = new Map<string, string[]>();
  for (const [key, value] of entries) {
    const v = value === "" ? EMPTY : value;
    if (v.split("\n").some((l) => !l.trim())) {
      throw new Error(`recorded value for "${key}" contains a blank line`);
    }
    const keys = byValue.get(v) ?? [];
    keys.push(key);
    byValue.set(v, keys);
  }
  const blocks = [...byValue].map(
    ([value, keys]) => keys.map((k) => `## ${k}`).join("\n") + "\n" + value,
  );
  return (
    header.map((l) => (l ? `# ${l}` : "#")).join("\n") +
    "\n\n" +
    blocks.join("\n\n") +
    "\n"
  );
}
