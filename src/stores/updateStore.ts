import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";

export type AfterDownload = "restart" | "quit";

interface UpdateState {
  status: UpdateStatus;
  downloaded: number;
  total: number | null;
  error: string | null;
  version: string | null;
  // Windows/Linux only: Sparkle keeps the downloaded update on macOS.
  update: Update | null;
  pendingUpdateVersion: string | null;
  dismissedVersion: string | null;
  afterDownload: AfterDownload | null;
  canInstallOnQuit: boolean;
  setStatus: (status: UpdateStatus) => void;
  setAvailable: (version: string, update: Update | null) => void;
  setDownloading: (version: string, update: Update | null) => void;
  setReady: (version: string) => void;
  setProgress: (downloaded: number, total: number | null) => void;
  setError: (error: string) => void;
  setPendingUpdateVersion: (version: string | null) => void;
  setDismissedVersion: (version: string | null) => void;
  setAfterDownload: (choice: AfterDownload | null) => void;
  setCanInstallOnQuit: (canInstallOnQuit: boolean) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: "idle",
  downloaded: 0,
  total: null,
  error: null,
  version: null,
  update: null,
  pendingUpdateVersion: null,
  dismissedVersion: null,
  afterDownload: null,
  canInstallOnQuit: true,
  setStatus: (status) => set({ status }),
  setAvailable: (version, update) =>
    set({
      status: "available",
      version,
      update,
      error: null,
      pendingUpdateVersion: null,
    }),
  setDownloading: (version, update) =>
    set({
      status: "downloading",
      version,
      update,
      pendingUpdateVersion: null,
      downloaded: 0,
      total: null,
      error: null,
    }),
  setReady: (version) => set({ status: "ready", version, error: null }),
  setProgress: (downloaded, total) =>
    set((state) =>
      state.downloaded === downloaded && state.total === total
        ? state
        : { downloaded, total },
    ),
  setError: (error) => set({ status: "error", error, afterDownload: null }),
  setPendingUpdateVersion: (version) => set({ pendingUpdateVersion: version }),
  setDismissedVersion: (version) => set({ dismissedVersion: version }),
  setAfterDownload: (choice) => set({ afterDownload: choice }),
  setCanInstallOnQuit: (canInstallOnQuit) => set({ canInstallOnQuit }),
}));

if (import.meta.env.DEV) {
  (window as unknown as { __updateStore?: typeof useUpdateStore }).__updateStore =
    useUpdateStore;
}
