import { create } from "zustand";

export type View = "home" | "editor";

interface ViewState {
  view: View;
  // Raised from the menu, possibly before the home is mounted; the home
  // lowers them once handled.
  searchRequested: boolean;
  importOpen: boolean;
  // Kept out of the schema, like the zoom: expanding a table's indexes is
  // neither saved in the .soca file nor undoable.
  indexesOpen: ReadonlySet<string>;
  showHome: () => void;
  showEditor: () => void;
  requestSearch: () => void;
  searchHandled: () => void;
  requestImport: () => void;
  closeImport: () => void;
  toggleIndexes: (tableId: string) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: "home",
  searchRequested: false,
  importOpen: false,
  indexesOpen: new Set(),
  showHome: () => set({ view: "home" }),
  showEditor: () => set({ view: "editor", searchRequested: false, importOpen: false }),
  requestSearch: () => set({ view: "home", searchRequested: true }),
  searchHandled: () => set({ searchRequested: false }),
  requestImport: () => set({ view: "home", importOpen: true }),
  closeImport: () => set({ importOpen: false }),
  toggleIndexes: (tableId) =>
    set((state) => {
      const next = new Set(state.indexesOpen);
      if (!next.delete(tableId)) next.add(tableId);
      return { indexesOpen: next };
    }),
}));
