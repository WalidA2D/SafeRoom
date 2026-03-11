import { create } from "zustand";

type ScanStatus = "idle" | "running" | "done";

interface Summary {
  network: { detected: number; suspicious: number };
  bluetooth: { detected: number; suspicious: number };
  visual: { flags: number };
}

interface ScanState {
  status: ScanStatus;
  progress: number;
  summary: Summary;
  start: () => void;
  setSummary: (partial: Partial<Summary>) => void;
  finish: () => void;
  reset: () => void;
}

const emptySummary: Summary = {
  network: { detected: 0, suspicious: 0 },
  bluetooth: { detected: 0, suspicious: 0 },
  visual: { flags: 0 },
};

export const useScanStore = create<ScanState>((set) => ({
  status: "idle",
  progress: 0,
  summary: emptySummary,
  start: () => set({ status: "running", progress: 0, summary: emptySummary }),
  setSummary: (partial) =>
    set((state) => ({
      summary: { ...state.summary, ...partial },
    })),
  finish: () => set({ status: "done", progress: 100 }),
  reset: () => set({ status: "idle", progress: 0, summary: emptySummary }),
}));

