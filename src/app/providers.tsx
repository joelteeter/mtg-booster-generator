"use client";

/*
 * Client-side providers.
 *
 * TanStack Query replaces the old hand-rolled `poolCache`. The QueryClient is
 * created inside a `useState` initialiser so a single client survives
 * re-renders without being shared between requests — with a static export
 * there is only ever one browser, but the pattern is the correct one and costs
 * nothing.
 *
 * `onNotice` from the Scryfall client is routed to a Sonner toast here: in the
 * old app it wrote directly into #status and #simStatus.
 *
 * `next-themes` puts the `dark` class on <html> before the page paints, which
 * is what makes shadcn's dark tokens — shipped since phase 0 and until now
 * never reachable — actually apply. It follows the system by default and
 * remembers an explicit choice in localStorage. The old app had no dark mode
 * at all, so this is the one place the port deliberately does more.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Scryfall data for a released set does not change while the tab
            // is open, and a pool load is a dozen requests.
            staleTime: Infinity,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
