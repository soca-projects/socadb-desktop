import { describe, it, expect } from "vitest";
import { dialectType, isTypeName, readType, resolveType } from "./sqlTypes";

describe("readType", () => {
  it.each([
    ["timestamp(3) with time zone DEFAULT now()", "timestamp with time zone", "3"],
    ["character varying(200) NOT NULL", "character varying", "200"],
    ["double precision", "double precision", null],
    ["public.mood DEFAULT 'a'", "mood", null],
    ["int(11) unsigned zerofill NOT NULL", "int", "11"],
  ])("reads %s", (text, base, args) => {
    expect(readType(text, null)).toMatchObject({ base, args });
  });

  it("reads arrays and the unsigned flag", () => {
    expect(readType("text[] NOT NULL", "postgresql")).toMatchObject({
      array: true,
      raw: "text[]",
    });
    expect(readType("decimal(10,2) unsigned", "mysql")).toMatchObject({ unsigned: true });
  });
});

describe("type names", () => {
  it("only knows its own types", () => {
    expect(isTypeName("VARCHAR")).toBe(true);
    expect(isTypeName("constructor")).toBe(false);
    expect(resolveType("constructor", null)).toBeNull();
  });

  it("renames a type for the database, or gives null when it has none", () => {
    expect(dialectType("int", "postgresql")).toBe("integer");
    expect(dialectType("jsonb", "mysql")).toBe("json");
    expect(dialectType("uuid", "mysql")).toBeNull();
    expect(dialectType("enum", "postgresql")).toBe("enum");
  });
});
