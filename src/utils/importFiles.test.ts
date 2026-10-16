import { describe, it, expect } from "vitest";
import {
  analyzeFiles,
  buildSchema,
  FolderRefusedError,
  formatOf,
  gridPositions,
  orderOutcomes,
  parseSource,
  planDialects,
  runImportBatch,
  stemOf,
} from "./importFiles";
import type { BatchFile, BatchIO, FileOutcome } from "./importFiles";
import { normalizeSchema } from "./schemaIntegrity";

const files: Record<string, string> = {
  "/in/shop.dbml": "Project p { database_type: 'MySQL' }\nTable t { id int }",
  "/in/blog.sql": "CREATE TABLE posts (id INT AUTO_INCREMENT PRIMARY KEY)",
  "/in/plain.sql": "CREATE TABLE notes (id INT PRIMARY KEY)",
  "/in/package.json": '{"name":"app"}',
  "/in/broken.dbml": "Table t {\n  id int\n  name\n}",
  "/in/empty.sql": "SELECT 1;",
  "/in/readme.md": "# hi",
};
const read = async (path: string) => {
  const content = files[path];
  if (content === undefined) throw new Error("not_found");
  return content;
};

describe("formatOf and stemOf", () => {
  it("reads the format from the extension", () => {
    expect(formatOf("/a/b.SQL")).toBe("sql");
    expect(formatOf("C:\\a\\b.dbml")).toBe("dbml");
    expect(formatOf("/a/b.json")).toBe("json");
    expect(formatOf("/a/b.md")).toBeNull();
    expect(formatOf("/a/sql")).toBeNull();
  });

  it("names a file after its stem", () => {
    expect(stemOf("/a/shop.v2.dbml")).toBe("shop.v2");
    expect(stemOf("C:\\a\\shop.sql")).toBe("shop");
  });
});

describe("analyzeFiles", () => {
  it("reads, detects and explains every failure, in selection order", async () => {
    const paths = Object.keys(files).concat("/in/gone.sql");
    const result = await analyzeFiles(paths, read);
    const by = (name: string) => result.find((f) => f.path.endsWith(name));
    expect(by("shop.dbml")).toMatchObject({
      format: "dbml",
      detected: "mysql",
      failure: null,
    });
    expect(by("blog.sql")).toMatchObject({ detected: "mysql", failure: null });
    expect(by("plain.sql")).toMatchObject({ detected: null, failure: null });
    expect(by("package.json")?.failure?.reason).toBe("not_schema");
    expect(by("broken.dbml")?.failure).toMatchObject({ reason: "dbml_syntax" });
    expect(by("broken.dbml")?.failure?.message).toContain("3");
    expect(by("empty.sql")?.failure?.reason).toBe("no_tables");
    expect(by("readme.md")?.failure?.reason).toBe("unknown_format");
    expect(by("gone.sql")?.failure?.reason).toBe("unreadable");
    expect(result.map((f) => f.path)).toEqual(paths);
  });
});

const file = (
  path: string,
  detected: BatchFile["detected"],
  failed = false,
): BatchFile => ({
  path,
  name: stemOf(path),
  format: "sql",
  content: "",
  detected,
  failure: failed ? { reason: "no_tables" } : null,
});

describe("planDialects", () => {
  it("keeps what each file says", () => {
    const plan = planDialects([file("/a.sql", "mysql"), file("/b.sql", "postgresql")]);
    expect(plan.ask).toEqual([]);
    expect(plan.known).toEqual({
      "/a.sql": { dbType: "mysql", source: "detected" },
      "/b.sql": { dbType: "postgresql", source: "detected" },
    });
  });

  it("gives undetected files the database every other file has", () => {
    const plan = planDialects([file("/a.sql", "mysql"), file("/b.sql", null)]);
    expect(plan.ask).toEqual([]);
    expect(plan.known["/b.sql"]).toEqual({ dbType: "mysql", source: "batch" });
  });

  it("asks when the batch gives no hint or a mixed one", () => {
    expect(planDialects([file("/a.sql", null), file("/b.sql", null)]).ask).toEqual([
      "/a.sql",
      "/b.sql",
    ]);
    const mixed = planDialects([
      file("/a.sql", "mysql"),
      file("/b.sql", "postgresql"),
      file("/c.sql", null),
    ]);
    expect(mixed.ask).toEqual(["/c.sql"]);
  });

  it("asks for a single undetected file and ignores failed ones", () => {
    expect(planDialects([file("/a.sql", null)]).ask).toEqual(["/a.sql"]);
    const plan = planDialects([file("/a.sql", "mysql", true), file("/b.sql", null)]);
    expect(plan.ask).toEqual(["/b.sql"]);
    expect(plan.known["/a.sql"]).toBeUndefined();
  });
});

const layout = async (tables: { id: string }[]) =>
  Object.fromEntries(tables.map((t, i) => [t.id, { x: i * 10, y: 5 }]));

describe("buildSchema", () => {
  const dbml =
    "Table users [headercolor: #3498DB] { id int [pk] }\nTable posts { id int }";

  it("lays out, colors and normalizes", async () => {
    const built = await buildSchema(
      parseSource("dbml", dbml, "postgresql"),
      "shop",
      "postgresql",
      layout,
    );
    expect(built.schema).toMatchObject({ name: "shop", dbType: "postgresql" });
    expect(built.schema.tables.map((t) => t.position)).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(built.schema.tables[0].color).toBe("#3498DB");
    expect(built.schema.tables[1].color).toBeDefined();
    expect(normalizeSchema(built.schema)).toBe(built.schema);
    expect(built.layoutFailed).toBe(false);
  });

  it("falls back to a grid when the layout fails", async () => {
    const built = await buildSchema(
      parseSource("dbml", dbml, "postgresql"),
      "shop",
      "postgresql",
      () => Promise.reject(new Error("elk")),
    );
    expect(built.layoutFailed).toBe(true);
    expect(built.schema.tables.map((t) => t.position)).toEqual(
      Object.values(gridPositions(built.schema.tables)),
    );
  });
});

function fakeIO(refuseAfter = Infinity) {
  const written: Record<string, string> = {};
  const remembered: string[] = [];
  let writes = 0;
  const io: BatchIO = {
    create: async (dir, name, content) => {
      if (writes++ >= refuseAfter) throw new FolderRefusedError();
      let path = `${dir}/${name}.soca`;
      for (let n = 2; written[path] !== undefined; n++) path = `${dir}/${name} ${n}.soca`;
      written[path] = content;
      return path;
    },
    remember: (path) => remembered.push(path),
    layout,
  };
  return { io, written, remembered };
}

const batch = async () =>
  (
    await analyzeFiles(
      ["/in/shop.dbml", "/in/blog.sql", "/in/package.json", "/in/plain.sql"],
      read,
    )
  ).map((f) => (f.path === "/in/plain.sql" ? { ...f, name: "shop" } : f));

describe("runImportBatch", () => {
  const choices = {
    "/in/shop.dbml": { dbType: "mysql", source: "detected" },
    "/in/blog.sql": { dbType: "mysql", source: "detected" },
    "/in/plain.sql": { dbType: "postgresql", source: "asked" },
  } as const;

  it("writes one file per source, never stops on a failure and names apart", async () => {
    const { io, written, remembered } = fakeIO();
    const outcomes: Record<string, FileOutcome> = {};
    const ended = await runImportBatch(await batch(), "/out", choices, io, {
      onOutcome: (path, outcome) => {
        outcomes[path] = outcome;
      },
      shouldStop: () => false,
    });
    expect(ended).toBe("done");
    expect(Object.keys(written)).toEqual([
      "/out/shop.soca",
      "/out/blog.soca",
      "/out/shop 2.soca",
    ]);
    expect(remembered).toEqual(Object.keys(written));
    expect(outcomes["/in/plain.sql"]).toMatchObject({
      status: "done",
      savedAs: "/out/shop 2.soca",
      dbType: "postgresql",
      source: "asked",
      tables: 1,
    });
    expect(outcomes["/in/package.json"]).toBeUndefined();
  });

  it("stops at a folder that refuses files and leaves the rest pending", async () => {
    const { io, written } = fakeIO(1);
    const outcomes: Record<string, FileOutcome> = {};
    const ended = await runImportBatch(await batch(), "/out", choices, io, {
      onOutcome: (path, outcome) => {
        outcomes[path] = outcome;
      },
      shouldStop: () => false,
    });
    expect(ended).toBe("folder_refused");
    expect(Object.keys(written)).toEqual(["/out/shop.soca"]);
    expect(outcomes["/in/blog.sql"]).toEqual({ status: "pending" });
  });

  it("stops between files when asked", async () => {
    const { io, written } = fakeIO();
    let calls = 0;
    const outcomes: Record<string, FileOutcome> = {};
    const ended = await runImportBatch(await batch(), "/out", choices, io, {
      onOutcome: (path, outcome) => {
        outcomes[path] = outcome;
      },
      shouldStop: () => calls++ > 0,
    });
    expect(ended).toBe("stopped");
    expect(Object.keys(written)).toEqual(["/out/shop.soca"]);
    expect(outcomes["/in/blog.sql"]).toBeUndefined();
  });

  it("reports a write that fails for another reason and goes on", async () => {
    const { io, written } = fakeIO();
    const create = io.create;
    io.create = (dir, name, content) =>
      name === "shop" && !written["/out/shop.soca"]
        ? Promise.reject(new Error("disk full"))
        : create(dir, name, content);
    const outcomes: Record<string, FileOutcome> = {};
    const ended = await runImportBatch(await batch(), "/out", choices, io, {
      onOutcome: (path, outcome) => {
        outcomes[path] = outcome;
      },
      shouldStop: () => false,
    });
    expect(ended).toBe("done");
    expect(outcomes["/in/shop.dbml"]).toMatchObject({
      status: "failed",
      reason: "write_failed",
    });
    expect(outcomes["/in/blog.sql"]).toMatchObject({ status: "done" });
  });
});

describe("orderOutcomes", () => {
  const done = (issues = 0, layoutFailed = false): FileOutcome => ({
    status: "done",
    savedAs: "/out/x.soca",
    dbType: "mysql",
    source: "detected",
    tables: 1,
    relations: 0,
    issues: Array.from({ length: issues }, () => ({ kind: "checkSkipped", table: "t" })),
    layoutFailed,
  });

  it("puts failures, then warnings, then successes, then skipped files", () => {
    const outcomes: Record<string, FileOutcome> = {
      "/a.sql": done(),
      "/b.sql": { status: "skipped" },
      "/c.sql": { status: "failed", reason: "no_tables" },
      "/d.sql": done(2),
      "/e.sql": done(0, true),
      "/f.sql": done(),
    };
    expect(orderOutcomes(Object.keys(outcomes), outcomes)).toEqual([
      "/c.sql",
      "/d.sql",
      "/e.sql",
      "/a.sql",
      "/f.sql",
      "/b.sql",
    ]);
  });
});
