import { create } from "zustand";
import type { Release } from "../utils/releaseNotes";

export type NotesModal = { since: string | null } | { incoming: Release[] };

interface ReleaseNotesState {
  toast: { since: string; version: string } | null;
  modal: NotesModal | null;
  showToast: (since: string, version: string) => void;
  dismissToast: () => void;
  openNotes: (since: string | null) => void;
  openIncomingNotes: (releases: Release[]) => void;
  closeNotes: () => void;
}

export const useReleaseNotesStore = create<ReleaseNotesState>((set) => ({
  toast: null,
  modal: null,
  showToast: (since, version) => set({ toast: { since, version } }),
  dismissToast: () => set({ toast: null }),
  openNotes: (since) => set({ modal: { since }, toast: null }),
  openIncomingNotes: (incoming) => set({ modal: { incoming } }),
  closeNotes: () => set({ modal: null }),
}));
