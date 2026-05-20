import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

interface UpdateState {
  status: UpdateStatus;
  downloaded: number;
  total: number | null;
  error: string | null;
  update: Update | null;
  // In-memory only. Set when the user opts in to "Install on Next Launch" from
  // the UpdateReadyToast. Read by useInstallOnNextLaunch (Win/Linux only) to
  // trigger update.install() on window close. Lost on app crash — that's fine,
  // re-check on next launch finds the same update again.
  pendingUpdateVersion: string | null;
  setStatus: (status: UpdateStatus) => void;
  setUpdateAvailable: (update: Update) => void;
  setProgress: (downloaded: number, total: number | null) => void;
  setError: (error: string) => void;
  setPendingUpdateVersion: (version: string | null) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: "idle",
  downloaded: 0,
  total: null,
  error: null,
  update: null,
  pendingUpdateVersion: null,
  setStatus: (status) => set({ status }),
  setUpdateAvailable: (update) =>
    set({
      status: "downloading",
      update,
      downloaded: 0,
      total: null,
      error: null,
    }),
  setProgress: (downloaded, total) =>
    set((state) =>
      state.downloaded === downloaded && state.total === total
        ? state
        : { downloaded, total },
    ),
  setError: (error) => set({ status: "error", error }),
  setPendingUpdateVersion: (version) => set({ pendingUpdateVersion: version }),
}));

if (import.meta.env.DEV) {
  (window as unknown as { __updateStore?: typeof useUpdateStore }).__updateStore =
    useUpdateStore;
}
