import { create } from "zustand";

interface ReleaseNotesState {
  toast: { since: string; version: string } | null;
  modal: { since: string | null } | null;
  showToast: (since: string, version: string) => void;
  dismissToast: () => void;
  openNotes: (since: string | null) => void;
  closeNotes: () => void;
}

export const useReleaseNotesStore = create<ReleaseNotesState>((set) => ({
  toast: null,
  modal: null,
  showToast: (since, version) => set({ toast: { since, version } }),
  dismissToast: () => set({ toast: null }),
  openNotes: (since) => set({ modal: { since }, toast: null }),
  closeNotes: () => set({ modal: null }),
}));
