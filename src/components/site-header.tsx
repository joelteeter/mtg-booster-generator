"use client";

/*
 * The site header: the brand, the pages, and the theme toggle.
 *
 * It lists pages, not modes — Boosters, Planechase, Archenemy. The choice
 * between the two booster builders is a tab strip on the booster page itself
 * (`booster/mode-tabs.tsx`), because it changes what the controls below it
 * mean rather than where you are.
 *
 * The menu below `md` is a disclosure panel rather than a slide-in drawer: for
 * three links a drawer would be machinery — a portal, a focus trap, a scroll
 * lock — around a list that fits on screen as it is.
 */
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/", label: "Boosters" },
  { href: "/lands", label: "Lands" },
  { href: "/tokens", label: "Tokens" },
  { href: "/planechase", label: "Planechase" },
  { href: "/archenemy", label: "Archenemy" },
];

/** Breakpoint at which the links sit in the bar instead of behind the button. */
const WIDE = "(min-width: 48rem)";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /*
   * The panel is closed by the click that navigates rather than by the route
   * change it causes: every link reachable while it is open — its own, and the
   * brand beside the button — closes it, and closing it in an effect would be
   * a second render for something the event already knows.
   */
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    /*
     * Widening the window hides the panel with CSS but would leave it open
     * underneath, so that narrowing again brings back a menu nobody asked for.
     */
    const wide = window.matchMedia(WIDE);
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          onClick={close}
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <Image
            src="/favicon.svg"
            alt=""
            width={24}
            height={24}
            className="size-6"
          />
          <span>Booster Generator</span>
        </Link>

        <nav aria-label="Pages" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={pathname === p.href ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    pathname === p.href
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <nav
          id="site-menu"
          aria-label="Pages"
          className="border-t bg-background md:hidden"
        >
          <ul className="mx-auto w-full max-w-5xl px-4 py-2 sm:px-6">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  onClick={close}
                  aria-current={pathname === p.href ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === p.href
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
