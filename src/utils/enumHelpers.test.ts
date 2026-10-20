import { describe, it, expect } from "vitest";
import { createEmptySchema } from "../stores/schemaStore";
import { addValues, enumNameError, parseValueList } from "./enumHelpers";

describe("parseValueList", () => {
  it("splits on commas, tabs and lines and drops blanks", () => {
    expect(parseValueList(" art, comics\nsports\t\t,  ")).toEqual([
      "art",
      "comics",
      "sports",
    ]);
  });
});

describe("addValues", () => {
  it("appends new values once, in order", () => {
    expect(addValues(["a", "b"], "b, c\na")).toEqual(["a", "b", "c"]);
  });
});

describe("enumNameError", () => {
  const schema = {
    ...createEmptySchema("s", "postgresql"),
    tables: [{ id: "t1", name: "loans", position: { x: 0, y: 0 }, columns: [] }],
    enums: [
      { id: "e1", name: "loan_status", values: [] },
      { id: "e2", name: "book_genre", values: [] },
    ],
  };

  it("refuses empty names, table names and other enums' names", () => {
    expect(enumNameError(schema, "e1", "  ")).toBe("empty");
    expect(enumNameError(schema, "e1", "loans")).toBe("table");
    expect(enumNameError(schema, "e1", "book_genre")).toBe("enum");
  });

  it("accepts the enum's own name and free names", () => {
    expect(enumNameError(schema, "e1", "loan_status")).toBeNull();
    expect(enumNameError(schema, "e1", "loan_state")).toBeNull();
  });
});
