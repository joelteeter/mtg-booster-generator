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
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";

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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
