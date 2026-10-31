"use client";

import { useEffect, useState } from "react";

/**
 * Delays a value, so typing a set code does not fire a pool load per keystroke.
 * The old UI did the same with a 350ms `setTimeout` in `refresh()`.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return settled;
}
