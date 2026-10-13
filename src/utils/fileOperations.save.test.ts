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
});
