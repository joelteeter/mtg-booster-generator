/*
 * Vanilla comparison.
 *
 * Compare a spec with the same set's vanilla spec, so the panel can show what
 * the chosen options actually changed instead of only which option touches a
 * slot. Both specs are built from the same `stats`, so anything caused by the
 * set's own contents (no mythics, no Backgrounds, empty pools dropped and
 * renormalised) cancels out, leaving only the changes the options are
 * responsible for.
 *
 * Slots are aligned by card position: each slot is compared with the vanilla
 * slot holding its first card. Both modes now lay the slots out in the same
 * order, so this is a straight pairing; matching by position rather than by
 * title also keeps it right if that ever stops being true.
 */
import type { DiffChange, Foil, Slot } from "./types";

/** Ignore sub-half-point wobble from renormalising. */
const DIFF_EPS = 0.005;

function slotAtPosition(slots: Slot[], pos: number): Slot | null {
  for (const s of slots) if (pos >= s.from && pos <= s.to) return s;
  return null;
}

/**
 * label -> { p, foil }. A label can appear more than once in a slot (a
 * fallback pool landing on a tier that is already there), so chances add.
 */
function outcomesByLabel(
  slot: Slot,
): Map<string, { p: number | null; foil?: Foil }> {
  const m = new Map<string, { p: number | null; foil?: Foil }>();
  for (const o of slot.outcomes) {
    const prev = m.get(o.label);
    if (!prev) m.set(o.label, { p: o.p, foil: o.foil });
    else prev.p = prev.p == null || o.p == null ? null : prev.p + o.p;
  }
  return m;
}

function diffSlotFromVanilla(slot: Slot, vSlot: Slot | null): DiffChange[] {
  const changes: DiffChange[] = [];
  if (!vSlot) return changes;
  if (slot.title !== vSlot.title)
    changes.push({
      kind: "title",
      fromTitle: vSlot.title,
      toTitle: slot.title,
    });
  const cur = outcomesByLabel(slot),
    van = outcomesByLabel(vSlot);
  cur.forEach((o, label) => {
    const v = van.get(label);
    if (!v) {
      changes.push({ kind: "added", label: label, toP: o.p });
      return;
    }
    if (o.p != null && v.p != null && Math.abs(o.p - v.p) >= DIFF_EPS)
      changes.push({ kind: "p", label: label, fromP: v.p, toP: o.p });
    if (String(o.foil || 0) !== String(v.foil || 0))
      changes.push({
        kind: "foil",
        label: label,
        fromFoil: v.foil || 0,
        toFoil: o.foil || 0,
      });
  });
  van.forEach((v, label) => {
    if (!cur.has(label))
      changes.push({ kind: "removed", label: label, fromP: v.p });
  });
  return changes;
}

/** One array of change records per slot, for the UI to format. */
export function diffFromVanilla(
  slots: Slot[],
  vanillaSlots: Slot[] | null,
): DiffChange[][] {
  if (!vanillaSlots) return slots.map(() => []);
  return slots.map((s) =>
    diffSlotFromVanilla(s, slotAtPosition(vanillaSlots, s.from)),
  );
}
