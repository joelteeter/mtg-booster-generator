import type { ReactNode } from "react";

/**
 * The body of a page, under the site header: a heading and a column of
 * sections. The heading is passed in rather than derived from the route so
 * that it is part of the prerendered HTML.
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
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  );
}
