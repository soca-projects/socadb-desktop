import { describe, it, expect } from "vitest";
import { DbmlSyntaxError, tokenizeDbml } from "./dbmlScan";

const kinds = (source: string) =>
  tokenizeDbml(source).map((t) => [t.kind, t.value, t.line] as const);

describe("tokenizeDbml", () => {
  it("reads every kind of token with its line", () => {
    expect(
      kinds(`Table "user list" [headercolor: #3498DB] {
  id int [default: -1, note: 'a\\'b']
  at timestamp [default: \`now()\`]
}
Ref: a.id <> b.id`),
    ).toEqual([
      ["word", "Table", 1],
      ["quoted", "user list", 1],
      ["punct", "[", 1],
      ["word", "headercolor", 1],
      ["punct", ":", 1],
      ["color", "#3498DB", 1],
      ["punct", "]", 1],
      ["punct", "{", 1],
      ["word", "id", 2],
      ["word", "int", 2],
      ["punct", "[", 2],
      ["word", "default", 2],
      ["punct", ":", 2],
      ["number", "-1", 2],
      ["punct", ",", 2],
      ["word", "note", 2],
      ["punct", ":", 2],
      ["string", "a'b", 2],
      ["punct", "]", 2],
      ["word", "at", 3],
      ["word", "timestamp", 3],
      ["punct", "[", 3],
      ["word", "default", 3],
      ["punct", ":", 3],
      ["expr", "now()", 3],
      ["punct", "]", 3],
      ["punct", "}", 4],
      ["word", "Ref", 5],
      ["punct", ":", 5],
      ["word", "a", 5],
      ["punct", ".", 5],
      ["word", "id", 5],
      ["op", "<>", 5],
      ["word", "b", 5],
      ["punct", ".", 5],
      ["word", "id", 5],
    ]);
  });

  it("skips comments and counts their lines", () => {
    expect(kinds("// one\n/* two\nthree */ x -- y")).toEqual([
      ["word", "x", 3],
      ["op", "-", 3],
      ["op", "-", 3],
      ["word", "y", 3],
    ]);
  });

  it("reads a word that starts with a digit as a name", () => {
    expect(kinds("2fa_enabled 42 1.5")).toEqual([
      ["word", "2fa_enabled", 1],
      ["number", "42", 1],
      ["number", "1.5", 1],
    ]);
  });

  it("unescapes only the backslash and the quote", () => {
    const [string] = tokenizeDbml(String.raw`'it\'s a \\ and a \n'`);
    expect(string.value).toBe(String.raw`it's a \ and a \n`);
    const [quoted] = tokenizeDbml(String.raw`"say \"hi\""`);
    expect(quoted.value).toBe('say "hi"');
  });

  it("keeps a backtick expression as written", () => {
    const [expr] = tokenizeDbml("`replace(x, '\\\\', '/')`");
    expect(expr).toMatchObject({
      kind: "expr",
      value: String.raw`replace(x, '\\', '/')`,
    });
  });

  it("drops the indentation of a multi-line string and joins escaped line ends", () => {
    const [note] = tokenizeDbml(
      "Note: '''\n    First line\n      indented \\\n    continued\n    Last'''",
    ).slice(2);
    expect(note).toMatchObject({ kind: "string", line: 1 });
    expect(note.value).toBe("First line\n  indented continued\nLast");
  });

  it("keeps lines right after a multi-line string", () => {
    const tokens = tokenizeDbml("'''a\nb\nc''' next");
    expect(tokens[1]).toMatchObject({ value: "next", line: 3 });
  });

  it("gives the line of a string that never closes", () => {
    expect(() => tokenizeDbml("Table t {\n  note: 'open\n}")).toThrow(DbmlSyntaxError);
    expect(() => tokenizeDbml("Table t {\n  note: 'open\n}")).toThrow("DBML line 2");
    expect(() => tokenizeDbml("x /* never")).toThrow("missing closing */");
  });

  it("does not take a # that isn't a color", () => {
    expect(kinds("#zz")).toEqual([
      ["punct", "#", 1],
      ["word", "zz", 1],
    ]);
  });
});
