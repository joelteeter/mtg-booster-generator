"use client";

/*
 * The download buttons and the "Compare on one card" view.
 *
 * Everything that decides anything lives in `lib/export/run.ts`, which is
 * compared against the old `exportFile` in `tests/export-run.test.ts`. This
 * hook supplies the three things that handler read out of the DOM — the
 * settings, where the status goes, and how a file is saved — and owns the
 * one-at-a-time flag that disabled the buttons.
 */
import { useCallback } from "react";

import { saveAs } from "@/lib/download";
import {
  cardForComparison,
  compareEnhance,
  enhancedMessage,
  enhancingMessage,
  runAlignmentPrint,
  runExport,
  type ExportKind,
} from "@/lib/export";
import { usePacksStore } from "@/store/packs";
import { useExportStore } from "@/store/export";

export function useExport() {
  const packs = usePacksStore((s) => s.packs);
  const exportFiles = usePacksStore((s) => s.exportFiles);
  const previewIndex = usePacksStore((s) => s.previewIndex);
  const settings = useExportStore((s) => s.settings);
  const exporting = useExportStore((s) => s.exporting);
  const comparing = useExportStore((s) => s.comparing);

  const run = useCallback(
    async (kind: ExportKind, idx: number) => {
      const store = useExportStore.getState();
      if (store.exporting || !exportFiles) return;
      store.setExporting(true);
      try {
        await runExport({
          kind,
          idx,
          packs: packs.map((p) => p.cards),
          base: exportFiles.base,
          settings: store.settings,
          onStatus: store.setStatus,
          save: saveAs,
        });
      } finally {
        useExportStore.getState().setExporting(false);
      }
    },
    [exportFiles, packs],
  );

  /*
   * Needs no packs: measuring the printer is as useful before a run as after
   * one, which is why it does not go through `runExport`.
   */
  const alignmentPrint = useCallback(async () => {
    const store = useExportStore.getState();
    if (store.exporting) return;
    store.setExporting(true);
    try {
      await runAlignmentPrint({
        settings: store.settings,
        onStatus: store.setStatus,
        save: saveAs,
      });
    } finally {
      useExportStore.getState().setExporting(false);
    }
  }, []);

  const compare = useCallback(async () => {
    const store = useExportStore.getState();
    const entry = cardForComparison(
      packs.map((p) => p.cards),
      previewIndex,
    );
    if (!entry) return;
    store.setComparing(true);
    store.setStatus(enhancingMessage(entry.card.name));
    try {
      const { plain, enhanced, ms } = await compareEnhance(
        entry.card,
        store.settings.quality,
      );
      store.showComparison({ name: entry.card.name, plain, enhanced });
      store.setStatus(enhancedMessage(entry.card.name, ms));
    } catch (e) {
      console.error(e);
      store.setStatus(`❌ ${(e as Error).message}`);
    } finally {
      useExportStore.getState().setComparing(false);
    }
  }, [packs, previewIndex]);

  return {
    run,
    compare,
    alignmentPrint,
    exporting,
    comparing,
    settings,
    hasPacks: packs.length > 0,
  };
}
