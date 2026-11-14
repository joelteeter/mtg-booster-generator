/*
 * Remembering settings between visits.
 *
 * Until now every store was plain in memory, so everything reset on reload —
 * not even per session, just per page load. That is fine for what a run
 * produced and wrong for how the printer behaves: a duplex offset and
 * rotation take three test sheets to find and describe the machine, not the
 * job, so losing them on a refresh means printing them again.
 *
 * `localStorage` rather than `sessionStorage` for the same reason. A printer
 * is still the same printer tomorrow.
 */
import { persist, type PersistOptions } from "zustand/middleware";

/** Bumped when a stored shape changes in a way old data cannot satisfy. */
export const STORE_VERSION = 1;

/**
 * Merge stored values over the defaults, one level into a named slice.
 *
 * Zustand's own merge is shallow, which would swap the whole slice for what
 * was stored — so a browser holding a copy from before an option existed
 * would come back missing it, as `undefined` rather than its default. Options
 * are added to this app often enough that this is the common case, not the
 * edge one.
 */
export function mergeSlice<T extends object, K extends keyof T>(
  key: K,
): NonNullable<PersistOptions<T, Partial<T>>["merge"]> {
  return (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<T>;
    const slice = saved[key];
    if (!slice || typeof slice !== "object") return current;
    return {
      ...current,
      ...saved,
      [key]: { ...(current[key] as object), ...(slice as object) },
    };
  };
}

export { persist };
