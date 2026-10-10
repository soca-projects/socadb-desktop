import { create } from "zustand";

export type View = "home" | "editor";

interface ViewState {
  view: View;
  // Bumped to ask the home to focus its search or open its import dialog,
  // possibly before it is mounted.
  searchRequest: number;
  importRequest: number;
  showHome: () => void;
  showEditor: () => void;
  requestSearch: () => void;
  requestImport: () => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: "home",
  searchRequest: 0,
  importRequest: 0,
  showHome: () => set({ view: "home" }),
  showEditor: () => set({ view: "editor" }),
  requestSearch: () => set((s) => ({ view: "home", searchRequest: s.searchRequest + 1 })),
  requestImport: () => set((s) => ({ view: "home", importRequest: s.importRequest + 1 })),
}));
