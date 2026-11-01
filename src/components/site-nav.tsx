"use client";

/*
 * The strip of sections across the top of every page.
 *
 * In the old app all four of these were tabs over one document, switched by a
 * `mode` variable. The two simulators are routes now, so this is navigation:
 * four links, the active one marked. The two booster builders still share a
 * route and differ by the mode they select, because they share every control
 * under them — the set picker, the options and the slot panel.
 *
 * It keeps the shadcn tab-strip look rather than becoming a row of links,
 * since to anyone using it nothing has changed.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useExportStore } from "@/store/export";
import { usePacksStore } from "@/store/packs";
import { useOptionsStore, type Mode } from "@/store/options";

interface Section {
  href: string;
  /** Set on the two sections that are modes of the booster page. */
  mode?: Mode;
  label: string;
}

const SECTIONS: Section[] = [
  { href: "/", mode: "play", label: "Booster Pack" },
  { href: "/", mode: "commander", label: "Commander Draft Booster" },
  { href: "/planechase", label: "Planechase Simulator" },
  { href: "/archenemy", label: "Archenemy Simulator" },
];

export function SiteNav() {
  const pathname = usePathname();
  const mode = useOptionsStore((s) => s.mode);
  const setMode = useOptionsStore((s) => s.setMode);
  const resetPacks = usePacksStore((s) => s.reset);
  const setExportStatus = useExportStore((s) => s.setStatus);

  /*
   * Switching between the two booster modes drops the last run, as changing
   * tab did in the old app: the packs were built for the mode that is being
   * left, and so were the downloads next to them. Visiting a simulator no
   * longer drops them, which is the point of it being its own page — the
   * stores outlive the navigation, so a finished run is still there when you
   * come back.
   */
  const choose = (target: Mode | undefined) => {
    if (!target || target === mode) return;
    setMode(target);
    resetPacks();
    setExportStatus("");
  };

  return (
    <nav aria-label="Sections">
      <ul className="inline-flex w-fit flex-wrap items-center justify-start gap-0.5 rounded-lg bg-muted p-[3px]">
        {SECTIONS.map((s) => {
          const active = s.mode
            ? pathname === "/" && s.mode === mode
            : pathname === s.href;
          return (
            <li key={s.label}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                onClick={() => choose(s.mode)}
                className={cn(
                  "inline-flex items-center justify-center rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
                  active
                    ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                    : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
