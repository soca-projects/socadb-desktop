import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

import { invoke } from "@tauri-apps/api/core";
import { saveSchemaFile } from "./fileOperations";
import { createEmptySchema } from "../stores/schemaStore";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveSchemaFile", () => {
  it("writes through the Rust command, whatever path the schema came from", async () => {
    const schema = createEmptySchema("shop", "mysql");
    await saveSchemaFile(schema, "/Users/ana/Documents/shop.soca");
    expect(invoke).toHaveBeenCalledWith("write_schema_file", {
      path: "/Users/ana/Documents/shop.soca",
      content: JSON.stringify(schema, null, 2),
    });
  });

  it("waits for a save in progress, so the newer content lands last", async () => {
    let finishFirst: (() => void) | undefined;
    vi.mocked(invoke).mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = () => resolve(undefined))),
    );
    const schema = createEmptySchema("shop", "mysql");
    const first = saveSchemaFile(schema, "/shop.soca");
    const second = saveSchemaFile({ ...schema, name: "newer" }, "/shop.soca");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(invoke).toHaveBeenCalledOnce();

    finishFirst?.();
    await Promise.all([first, second]);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(vi.mocked(invoke).mock.calls[1]?.[1]).toMatchObject({
      content: expect.stringContaining('"newer"'),
    });
  });

  it("doesn't make a save to another file wait", async () => {
    let finishFirst: (() => void) | undefined;
    vi.mocked(invoke).mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = () => resolve(undefined))),
    );
    const schema = createEmptySchema("shop", "mysql");
    const stuck = saveSchemaFile(schema, "/network/shop.soca");
    await saveSchemaFile(schema, "/local/shop.soca");
    expect(invoke).toHaveBeenCalledTimes(2);

    finishFirst?.();
    await stuck;
  });

  it("still runs the next save after one fails, and reports each failure to its caller", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("disk full"));
    const schema = createEmptySchema("shop", "mysql");
    const first = saveSchemaFile(schema, "/shop.soca");
    const second = saveSchemaFile(schema, "/shop.soca");
    await expect(first).rejects.toThrow("disk full");
    await expect(second).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
