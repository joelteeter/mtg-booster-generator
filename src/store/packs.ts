/*
 * The last generated run: the packs, the CSV files, the status line and which
 * pack the preview is showing.
 *
 * `js/generate.js` kept `lastPacks` and `lastExport` as globals that
 * `preview.js` and `downloads.js` read directly. They belong here, next to the
 * options, so the preview and the downloads table are rendered from state
 * rather than poked at.
 *
 * Switching tabs clears the run. The old app did the same thing by hiding
 * `#downloadContainer`, which held the table and the preview both: the packs
 * stayed in the global but nothing could reach them again.
 */
import { create } from "zustand";

import type { ExportFiles, GeneratedPack } from "@/lib/generate";

export const READY = "Ready";

interface PacksStore {
  packs: GeneratedPack[];
  exportFiles: ExportFiles | null;
  tokenSheetCount: number;
  /** The line under the Generate button. Mirrors the old `#status`. */
  status: string;
  generating: boolean;
  previewOpen: boolean;
  previewIndex: number;

  begin(status: string): void;
  progress(status: string): void;
  finish(result: {
    packs: GeneratedPack[];
    exportFiles: ExportFiles;
    tokenSheetCount: number;
    status: string;
  }): void;
  fail(message: string): void;
  reset(): void;
  togglePreview(): void;
  showPack(index: number): void;
}

const cleared = {
  packs: [] as GeneratedPack[],
  exportFiles: null,
  tokenSheetCount: 0,
};

export const usePacksStore = create<PacksStore>((set) => ({
  ...cleared,
  status: READY,
  generating: false,
  previewOpen: false,
  previewIndex: 0,

  begin: (status) => set({ ...cleared, status, generating: true }),
  progress: (status) => set({ status }),
  finish: ({ packs, exportFiles, tokenSheetCount, status }) =>
    set({
      packs,
      exportFiles,
      tokenSheetCount,
      status,
      generating: false,
      // The old code called renderPreview(0) after a run, so a fresh run
      // starts at its first pack rather than wherever the last one was left.
      previewIndex: 0,
    }),
  fail: (message) =>
    set({ ...cleared, status: `❌ Error: ${message}`, generating: false }),
  reset: () => set({ ...cleared, status: READY, generating: false }),
  togglePreview: () => set((s) => ({ previewOpen: !s.previewOpen })),
  showPack: (index) =>
    set((s) => ({
      previewIndex: Math.max(0, Math.min(s.packs.length - 1, index)),
    })),
}));
