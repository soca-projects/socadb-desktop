import { create } from "zustand";
import type { BatchFile, DbTypeChoice, FileOutcome } from "../utils/importFiles";

export type ImportPhase =
  | "idle"
  | "asking"
  | "running"
  | "done"
  | "stopped"
  | "folder_refused";

export interface ImportFlowState {
  mode: "draft" | "batch";
  phase: ImportPhase;
  folder: string | null;
  files: BatchFile[];
  choices: Record<string, DbTypeChoice>;
  ask: string[];
  outcomes: Record<string, FileOutcome>;
  stopRequested: boolean;
}

const IDLE: ImportFlowState = {
  mode: "batch",
  phase: "idle",
  folder: null,
  files: [],
  choices: {},
  ask: [],
  outcomes: {},
  stopRequested: false,
};

export const useImportFlowStore = create<ImportFlowState>(() => IDLE);

export const resetImportFlow = () => useImportFlowStore.setState(IDLE, true);
