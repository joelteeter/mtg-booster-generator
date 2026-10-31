"use client";

/*
 * The Generate button, its status line, and what a finished run produces.
 *
 * The status line is `aria-live`, which the old `#status` div was not: it is
 * the only feedback a long generation gives, and it should be announced.
 */
import { Button } from "@/components/ui/button";
import { useGenerate } from "@/hooks/use-generate";
import { usePacksStore } from "@/store/packs";

import { DownloadTable } from "./download-table";
import { PackPreview } from "./pack-preview";

export function GeneratePanel() {
  const { run, generating } = useGenerate();
  const status = usePacksStore((s) => s.status);
  const packs = usePacksStore((s) => s.packs);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="self-start"
          disabled={generating}
          onClick={run}
        >
          Generate Booster Files
        </Button>
        <p aria-live="polite" className="text-sm font-medium text-primary">
          {status}
        </p>
      </div>
      {packs.length > 0 && (
        <>
          <DownloadTable />
          <PackPreview />
        </>
      )}
    </div>
  );
}
