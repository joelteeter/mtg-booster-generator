"use client";

/*
 * Light, dark, or whatever the system is set to.
 *
 * One button that cycles rather than a two-state switch, because "follow the
 * system" is the default and a plain sun/moon toggle gives no way back to it.
 * The icon shows the current choice; the label and tooltip say what a click
 * does.
 *
 * `next-themes` writes the class before the page paints, so there is no flash
 * of the wrong theme — but it also means the first client render has to match
 * the prerendered HTML, which is why the icon only becomes the real one once
 * the page has hydrated.
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ORDER = ["system", "light", "dark"] as const;
type Choice = (typeof ORDER)[number];

const ICON = { system: Monitor, light: Sun, dark: Moon };
const NAME: Record<Choice, string> = {
  system: "system",
  light: "light",
  dark: "dark",
};

/** False while rendering on the server and on the first client render. */
const subscribe = () => () => {};
const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const choice: Choice =
    hydrated && ORDER.includes(theme as Choice) ? (theme as Choice) : "system";
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const Icon = ICON[choice];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${NAME[choice]}. Switch to ${NAME[next]}.`}
          onClick={() => setTheme(next)}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Theme: {NAME[choice]} — click for {NAME[next]}</TooltipContent>
    </Tooltip>
  );
}
