import { describe, it, expect } from "vitest";
import {
  matchingParen,
  splitStatements,
  splitTopLevel,
  stripComments,
  tokenize,
} from "./sqlScan";

describe("stripComments", () => {
  it("removes single-line comments", () => {
    expect(stripComments("SELECT * FROM t; -- comment")).toBe("SELECT * FROM t; ");
  });

  it("removes multi-line comments", () => {
    expect(stripComments("SELECT /* block */ * FROM t")).toBe("SELECT  * FROM t");
  });

  it("handles both comment types", () => {
    const sql = "-- header\nSELECT /* x */ *\n-- footer";
    const result = stripComments(sql);
    expect(result).not.toContain("--");
    expect(result).not.toContain("/*");
  });

  it("keeps comment markers inside strings", () => {
    const sql = "a VARCHAR(40) DEFAULT 'it''s -- not /* a */ comment', b INT";
    expect(stripComments(sql, "postgresql")).toBe(sql);
  });

  it("does not open a string on an apostrophe inside a comment", () => {
    const sql = "-- don't\nCREATE TABLE t (a INT);";
    expect(splitStatements(stripComments(sql))).toEqual(["CREATE TABLE t (a INT)"]);
  });

  it("removes MySQL # comments and conditional comments", () => {
    const sql =
      "# dump\n/*!40101 SET NAMES utf8 */;\nCREATE TABLE t (g POINT /*!80003 SRID 4326 */);";
    expect(splitStatements(stripComments(sql, "mysql"), "mysql")).toEqual([
      "CREATE TABLE t (g POINT )",
    ]);
  });

  it("drops psql meta-commands such as pg_dump's \\restrict", () => {
    const sql = "\\restrict abc123\nSET client_encoding = 'UTF8';\n\\unrestrict abc123\n";
    expect(splitStatements(stripComments(sql, "postgresql"))).toEqual([
      "SET client_encoding = 'UTF8'",
    ]);
  });
});

describe("splitStatements", () => {
  it("splits on semicolons", () => {
    const result = splitStatements("CREATE TABLE a (id INT); CREATE TABLE b (id INT)");
    expect(result).toHaveLength(2);
  });

  it("ignores semicolons inside quotes", () => {
    const result = splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1");
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("a;b");
  });

  it("handles trailing content without semicolon", () => {
    const result = splitStatements("SELECT 1");
    expect(result).toHaveLength(1);
  });

  it("skips empty statements", () => {
    const result = splitStatements(";;SELECT 1;;");
    expect(result).toHaveLength(1);
  });

  it("reads backslash escapes in MySQL strings only", () => {
    const sql = String.raw`SELECT 'C:\'; SELECT 2;`;
    expect(splitStatements(sql, "mysql")).toHaveLength(1);
    expect(splitStatements(sql, "postgresql")).toHaveLength(2);
  });

  it("keeps PostgreSQL dollar-quoted bodies whole", () => {
    const sql =
      "CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; $body$ LANGUAGE sql; CREATE TABLE t (a INT);";
    const result = splitStatements(sql, "postgresql");
    expect(result).toHaveLength(2);
    expect(result[1]).toBe("CREATE TABLE t (a INT)");
  });

  it("does not let a stray parenthesis swallow the next statements", () => {
    expect(splitStatements("SELECT (1; CREATE TABLE t (a INT);")).toHaveLength(2);
  });
});

describe("splitTopLevel", () => {
  it("splits on commas outside parentheses and strings", () => {
    expect(
      splitTopLevel("a DECIMAL(10, 2), b ENUM('x,y', 'z'), c INT", ",", "mysql"),
    ).toEqual(["a DECIMAL(10, 2)", "b ENUM('x,y', 'z')", "c INT"]);
  });
});

describe("matchingParen", () => {
  it("skips parentheses inside strings", () => {
    const text = "t (a VARCHAR(3) DEFAULT ')', b INT) COMMENT='(x'";
    expect(text[matchingParen(text, 2, "mysql")]).toBe(")");
    expect(matchingParen(text, 2, "mysql")).toBe(text.indexOf(") COMMENT"));
  });
});

describe("tokenize", () => {
  const texts = (text: string) => tokenize(text, "postgresql").map((t) => t.text);

  it("keeps quoted literals, casts and calls whole", () => {
    expect(texts("DEFAULT 'a b'::character varying NOT NULL")).toEqual([
      "DEFAULT",
      "'a b'::character",
      "varying",
      "NOT",
      "NULL",
    ]);
    expect(texts("DEFAULT nextval('s'::regclass)")).toEqual([
      "DEFAULT",
      "nextval('s'::regclass)",
    ]);
  });

  it("stops a keyword before its parenthesis", () => {
    expect(texts("CHECK(price > 0) DEFAULT(0)")).toEqual([
      "CHECK",
      "(price > 0)",
      "DEFAULT",
      "(0)",
    ]);
  });
});
