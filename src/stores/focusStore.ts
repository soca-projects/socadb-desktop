import { create } from "zustand";

interface FocusState {
  focusMode: boolean;
  toggleFocusMode: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
}));
