import { create } from "zustand";

export type View = "home" | "editor";

interface ViewState {
  view: View;
  // Raised from the menu, possibly before the home is mounted; the home
  // lowers it once handled.
  searchRequested: boolean;
  // Kept out of the schema, like the zoom: expanding a table's indexes is
  // neither saved in the .soca file nor undoable.
  indexesOpen: ReadonlySet<string>;
  settingsOpen: boolean;
  aboutOpen: boolean;
  showHome: () => void;
  showEditor: () => void;
  requestSearch: () => void;
  searchHandled: () => void;
  toggleIndexes: (tableId: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openAbout: () => void;
  closeAbout: () => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: "home",
  searchRequested: false,
  indexesOpen: new Set(),
  settingsOpen: false,
  aboutOpen: false,
  showHome: () => set({ view: "home" }),
  showEditor: () => set({ view: "editor", searchRequested: false }),
  requestSearch: () => set({ view: "home", searchRequested: true }),
  searchHandled: () => set({ searchRequested: false }),
  toggleIndexes: (tableId) =>
    set((state) => {
      const next = new Set(state.indexesOpen);
      if (!next.delete(tableId)) next.add(tableId);
      return { indexesOpen: next };
    }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openAbout: () => set({ aboutOpen: true }),
  closeAbout: () => set({ aboutOpen: false }),
}));
