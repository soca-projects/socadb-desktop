import { create } from "zustand";

export type View = "home" | "editor";

interface ViewState {
  view: View;
  // Raised from the menu, possibly before the home is mounted; the home
  // lowers them once handled.
  searchRequested: boolean;
  importOpen: boolean;
  showHome: () => void;
  showEditor: () => void;
  requestSearch: () => void;
  searchHandled: () => void;
  requestImport: () => void;
  closeImport: () => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: "home",
  searchRequested: false,
  importOpen: false,
  showHome: () => set({ view: "home" }),
  showEditor: () => set({ view: "editor", searchRequested: false, importOpen: false }),
  requestSearch: () => set({ view: "home", searchRequested: true }),
  searchHandled: () => set({ searchRequested: false }),
  requestImport: () => set({ view: "home", importOpen: true }),
  closeImport: () => set({ importOpen: false }),
}));
