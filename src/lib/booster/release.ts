/*
 * Release dates.
 *
 * Scryfall lists sets long before they are out, and gives released_at as a
 * plain YYYY-MM-DD. Comparing those as strings keeps time zones out of it: a
 * set counts as released once its date is not in the future. A set with no date
 * at all is treated as unreleased rather than assumed out.
 */
import type { SetLike } from "./types";

export function todayISO(now?: Date): string {
  const d = now || new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isReleased(
  set: SetLike | null | undefined,
  today?: string,
): boolean {
  const date = set && (set.released_at || set.released);
  return !!date && date <= (today || todayISO());
}
