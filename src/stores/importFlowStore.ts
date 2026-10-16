import { create } from "zustand";
import type { BatchFile, DbTypeChoice, FileOutcome } from "../utils/importFiles";

export type ImportPhase =
  | "idle"
  | "asking"
  | "preparing"
  | "running"
  | "done"
  | "stopped"
  | "folder_refused";

export interface ImportFlowState {
  mode: "draft" | "batch";
  phase: ImportPhase;
  folder: string | null;
  sourceFolder: string | null;
  folderWritable: boolean | null;
  home: string | null;
  files: BatchFile[];
  choices: Record<string, DbTypeChoice>;
  ask: string[];
  outcomes: Record<string, FileOutcome>;
  stopRequested: boolean;
  draftStamp: string | null;
}

const IDLE: ImportFlowState = {
  mode: "batch",
  phase: "idle",
  folder: null,
  sourceFolder: null,
  folderWritable: null,
  home: null,
  files: [],
  choices: {},
  ask: [],
  outcomes: {},
  stopRequested: false,
  draftStamp: null,
};

export const useImportFlowStore = create<ImportFlowState>(() => IDLE);

export const resetImportFlow = () => useImportFlowStore.setState(IDLE, true);
