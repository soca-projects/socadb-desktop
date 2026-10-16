import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(() => Promise.resolve("/in")),
  homeDir: vi.fn(() => Promise.resolve("/Users/me")),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("./recentFiles", () => ({ addRecentFile: vi.fn() }));
vi.mock("./importApply", () => ({
  replaceWithImport: vi.fn(),
  showImportSummary: vi.fn(),
}));
vi.mock("./autoLayout", () => ({ computeAutoLayout: vi.fn(() => Promise.resolve({})) }));

import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { dirname } from "@tauri-apps/api/path";
import { addRecentFile } from "./recentFiles";
import { replaceWithImport } from "./importApply";
import { resetImportFlow, useImportFlowStore } from "../stores/importFlowStore";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import {
  answerDialects,
  changeFolder,
  chooseAnotherFolder,
  importDraft,
  importFromHome,
} from "./homeImport";
import type { BatchFile } from "./importFiles";

const SQL = "CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY)";

const file = (path: string): BatchFile => ({
  path,
  name: path.replace(/^.*\/|\.sql$/g, ""),
  format: "sql",
  content: SQL,
  detected: "mysql",
  failure: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetImportFlow();
  useSchemaStore.setState({
    schema: createEmptySchema(),
    filePath: null,
    savedAt: null,
  });
  vi.mocked(readTextFile).mockResolvedValue(SQL);
  vi.mocked(dirname).mockImplementation((p) =>
    Promise.resolve(p.slice(0, p.lastIndexOf("/"))),
  );
  vi.mocked(invoke).mockImplementation((_cmd, args) =>
    Promise.resolve(`/out/${String((args as { name: string }).name)}.soca`),
  );
});

describe("importFromHome", () => {
  it("won't start a second import while one is under way", async () => {
    for (const phase of ["asking", "preparing", "running", "folder_refused"] as const) {
      useImportFlowStore.setState({ phase });
      await importFromHome();
      expect(open).not.toHaveBeenCalled();
    }
  });

  it("won't start a second import while the first is still in its pickers", async () => {
    let pick: (paths: string[] | null) => void = () => undefined;
    vi.mocked(open).mockImplementation(
      () =>
        new Promise((resolve) => {
          pick = resolve;
        }),
    );
    const first = importFromHome();
    await importFromHome();
    expect(open).toHaveBeenCalledTimes(1);
    pick(null);
    await first;
  });

  it("prepares several files without a second picker, saving next to them", async () => {
    vi.mocked(open).mockResolvedValue(["/in/a.sql", "/in/b.sql"]);
    await importFromHome();
    expect(open).toHaveBeenCalledTimes(1);
    expect(useImportFlowStore.getState()).toMatchObject({
      mode: "batch",
      phase: "preparing",
      folder: "/in",
      sourceFolder: "/in",
      home: "/Users/me",
      ask: [],
    });
    answerDialects({});
    await vi.waitFor(() => expect(useImportFlowStore.getState().phase).toBe("done"));
    expect(invoke).toHaveBeenCalledWith(
      "create_schema_file",
      expect.objectContaining({ dir: "/in", name: "a" }),
    );
  });

  it("checks at once that SocaDB may write to the destination", async () => {
    vi.mocked(open).mockResolvedValue(["/in/a.sql", "/in/b.sql"]);
    await importFromHome();
    await vi.waitFor(() =>
      expect(useImportFlowStore.getState().folderWritable).toBe(true),
    );
    expect(invoke).toHaveBeenCalledWith("probe_schema_folder", { dir: "/in" });
  });

  it("says so in the window when the destination refuses files", async () => {
    vi.mocked(open).mockResolvedValue(["/in/a.sql", "/in/b.sql"]);
    vi.mocked(invoke).mockImplementation((cmd) =>
      cmd === "probe_schema_folder"
        ? Promise.reject("folder_refused")
        : Promise.resolve("/out/x.soca"),
    );
    await importFromHome();
    await vi.waitFor(() =>
      expect(useImportFlowStore.getState().folderWritable).toBe(false),
    );
    expect(useImportFlowStore.getState().phase).toBe("preparing");
  });

  it("doesn't call it the folder of the files when they come from several", async () => {
    vi.mocked(open).mockResolvedValue(["/in/a.sql", "/other/b.sql"]);
    await importFromHome();
    expect(useImportFlowStore.getState()).toMatchObject({
      folder: "/in",
      sourceFolder: null,
    });
  });

  it("clears a finished recap before a new import", async () => {
    useImportFlowStore.setState({ phase: "done", files: [file("/in/a.sql")] });
    vi.mocked(open).mockResolvedValue(null);
    await importFromHome();
    expect(useImportFlowStore.getState()).toMatchObject({ phase: "idle", files: [] });
  });
});

describe("changeFolder", () => {
  it("lets the user pick where the schemas go, starting from the current folder", async () => {
    useImportFlowStore.setState({ mode: "batch", phase: "preparing", folder: "/in" });
    vi.mocked(open).mockResolvedValue("/elsewhere");
    await changeFolder();
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: true,
        defaultPath: "/in",
        title: expect.any(String),
      }),
    );
    expect(useImportFlowStore.getState()).toMatchObject({
      phase: "preparing",
      folder: "/elsewhere",
    });
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("probe_schema_folder", { dir: "/elsewhere" }),
    );
  });

  it("keeps the folder when the picker is cancelled", async () => {
    useImportFlowStore.setState({ mode: "batch", phase: "preparing", folder: "/in" });
    vi.mocked(open).mockResolvedValue(null);
    await changeFolder();
    expect(useImportFlowStore.getState().folder).toBe("/in");
  });
});

describe("chooseAnotherFolder", () => {
  it("doesn't carry a stop pressed before the folder was refused", async () => {
    useImportFlowStore.setState({
      mode: "batch",
      phase: "folder_refused",
      folder: "/locked",
      files: [file("/in/a.sql"), file("/in/b.sql")],
      choices: {
        "/in/a.sql": { dbType: "mysql", source: "detected" },
        "/in/b.sql": { dbType: "mysql", source: "detected" },
      },
      outcomes: {
        "/in/a.sql": { status: "pending" },
        "/in/b.sql": { status: "pending" },
      },
      stopRequested: true,
    });
    vi.mocked(open).mockResolvedValue("/out");
    await chooseAnotherFolder();
    const { phase, outcomes } = useImportFlowStore.getState();
    expect(phase).toBe("done");
    expect(outcomes["/in/b.sql"]).toMatchObject({ status: "done" });
  });

  it("ends a run that throws instead of leaving it running", async () => {
    useImportFlowStore.setState({
      mode: "batch",
      phase: "folder_refused",
      folder: "/locked",
      files: [file("/in/a.sql")],
      choices: { "/in/a.sql": { dbType: "mysql", source: "detected" } },
      outcomes: { "/in/a.sql": { status: "pending" } },
    });
    vi.mocked(open).mockResolvedValue("/out");
    vi.mocked(addRecentFile).mockImplementation(() => {
      throw new Error("boom");
    });
    await chooseAnotherFolder();
    expect(useImportFlowStore.getState().phase).toBe("stopped");
  });
});

describe("importDraft", () => {
  it("leaves a batch under way alone", async () => {
    useImportFlowStore.setState({ mode: "batch", phase: "preparing", folder: "/in" });
    await importDraft("/in/a.sql");
    expect(readTextFile).not.toHaveBeenCalled();
    expect(useImportFlowStore.getState()).toMatchObject({ mode: "batch", folder: "/in" });
  });
});

describe("answerDialects", () => {
  const dirtyDraft = (updatedAt: string) => {
    const schema = { ...createEmptySchema(), updatedAt };
    schema.tables = [{ id: "t", name: "t", position: { x: 0, y: 0 }, columns: [] }];
    useSchemaStore.setState({ schema, savedAt: null, filePath: null });
  };
  const asking = (draftStamp: string) =>
    useImportFlowStore.setState({
      mode: "draft",
      phase: "asking",
      files: [{ ...file("/in/a.sql"), detected: null }],
      ask: ["/in/a.sql"],
      draftStamp,
    });

  it("imports over a draft the user already chose to replace", () => {
    dirtyDraft("2026-10-16T10:00:00.000Z");
    asking("2026-10-16T10:00:00.000Z");
    answerDialects({ "/in/a.sql": "postgresql" });
    expect(emit).not.toHaveBeenCalled();
    expect(replaceWithImport).toHaveBeenCalledTimes(1);
  });

  it("goes through the unsaved guard if the draft changed while the question was open", () => {
    dirtyDraft("2026-10-16T10:05:00.000Z");
    asking("2026-10-16T10:00:00.000Z");
    answerDialects({ "/in/a.sql": "postgresql" });
    expect(replaceWithImport).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("unsaved-guard-import-file", "/in/a.sql");
    expect(useImportFlowStore.getState().phase).toBe("idle");
  });
});
