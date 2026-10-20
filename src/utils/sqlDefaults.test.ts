import { describe, it, expect } from "vitest";
import { readDefault } from "./sqlDefaults";

describe("readDefault", () => {
  it.each([
    ["postgresql", "'draft'::character varying", { value: "draft", kind: "value" }],
    ["postgresql", "'it''s'::text", { value: "it's", kind: "value" }],
    ["postgresql", "'happy'::public.mood", { value: "happy", kind: "value" }],
    ["postgresql", String.raw`'C:\temp'`, { value: String.raw`C:\temp`, kind: "value" }],
    ["postgresql", "0", { value: "0", kind: "value" }],
    ["postgresql", "'0'::numeric", { value: "0", kind: "value" }],
    [
      "postgresql",
      "(gen_random_uuid())::text",
      {
        value: "(gen_random_uuid())::text",
        kind: "expression",
      },
    ],
    [
      "mysql",
      String.raw`'C:\\temp\\new'`,
      { value: String.raw`C:\temp\new`, kind: "value" },
    ],
    ["mysql", String.raw`'it\'s'`, { value: "it's", kind: "value" }],
    ["mysql", `'say ""hi""'`, { value: 'say ""hi""', kind: "value" }],
    ["mysql", "(_utf8mb4'{}')", { value: "{}", kind: "value" }],
    ["mysql", "'0.00'", { value: "0.00", kind: "value" }],
    ["mysql", "(uuid())", { value: "uuid()", kind: "expression" }],
    ["mysql", "(now()) + (1)", { value: "(now()) + (1)", kind: "expression" }],
  ] as const)("reads %s %s", (dialect, raw, expected) => {
    expect(readDefault(raw, dialect)).toEqual(expected);
  });

  it.each(["NULL", "null", "NULL::character varying"])(
    "reads %s as no default",
    (raw) => {
      expect(readDefault(raw, "postgresql")).toEqual({ value: null });
    },
  );
});
