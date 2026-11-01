import type { ReactNode } from "react";

import { SiteNav } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * The chrome every page shares: the heading, the theme toggle and the section
 * strip. The heading is passed in rather than derived from the route so that
 * it is part of the prerendered HTML.
 */
export function PageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <ThemeToggle />
      </div>
      <div className="flex flex-col gap-6">
        <SiteNav />
        {children}
      </div>
    </main>
  );
}
