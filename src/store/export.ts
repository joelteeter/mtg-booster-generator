/*
 * The print settings, and what the export area is currently saying.
 *
 * These were loose DOM state in the old app: the controls above the downloads
 * table, a module-level `customBackUrl` in `js/downloads.js`, and an
 * `exporting` flag that disabled the buttons. Unlike the pack options they are
 * not remembered per tab — there was one set of them in the old UI, and paper
 * size is not something anyone wants to re-pick per tab.
 */
import { create } from "zustand";

import type { ExportSettings } from "@/lib/export";

/** The old index.html's initial control values. */
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  paper: "letter",
  bleedMm: 2,
  quality: "high",
  dfcMode: "separate",
  flip: "long",
  backImage: "standard",
  customBackUrl: null,
  newPagePerPack: false,
  enhance: false,
  backOffsetXMm: 0,
  backOffsetYMm: 0,
  backRotationDeg: 0,
};

interface ExportStore {
  settings: ExportSettings;
  /** The name of the chosen card-back image, for the hint under the picker. */
  customBackName: string | null;
  /** The line under the downloads table. Mirrors the old `#exportStatus`. */
  status: string;
  /** One export at a time, as in the old app: the buttons are disabled. */
  exporting: boolean;
  /** The "Compare on one card" overlay, once it has something to show. */
  comparison: { name: string; plain: HTMLCanvasElement; enhanced: HTMLCanvasElement } | null;
  comparing: boolean;

  set<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]): void;
  /** Keeps the object URL and the name together: they are set as a pair. */
  setCustomBack(url: string | null, name: string | null): void;
  setStatus(status: string): void;
  setExporting(exporting: boolean): void;
  setComparing(comparing: boolean): void;
  showComparison(c: ExportStore["comparison"]): void;
}

export const useExportStore = create<ExportStore>((set, get) => ({
  settings: { ...DEFAULT_EXPORT_SETTINGS },
  customBackName: null,
  status: "",
  exporting: false,
  comparison: null,
  comparing: false,

  set: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),
  setCustomBack: (url, name) => {
    // The old code revoked the previous one before taking a new file.
    const previous = get().settings.customBackUrl;
    if (previous && previous !== url) URL.revokeObjectURL(previous);
    set((s) => ({
      settings: { ...s.settings, customBackUrl: url },
      customBackName: name,
    }));
  },
  setStatus: (status) => set({ status }),
  setExporting: (exporting) => set({ exporting }),
  setComparing: (comparing) => set({ comparing }),
  showComparison: (comparison) => set({ comparison }),
}));
