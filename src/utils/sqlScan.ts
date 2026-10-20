import type { DbType } from "../types/schema";

export function quoteEnd(sql: string, start: number, dialect: DbType | null): number {
  const open = sql[start];
  if (open === "'" || open === '"' || open === "`") {
    // MySQL reads a backslash in a string as an escape; PostgreSQL's standard
    // strings keep it as a character, except in E'…' strings.
    const escapes =
      open !== "`" && (dialect !== "postgresql" || isEscapeString(sql, start));
    for (let i = start + 1; i < sql.length; i++) {
      if (escapes && sql[i] === "\\") {
        i++;
        continue;
      }
      if (sql[i] !== open) continue;
      if (sql[i + 1] !== open) return i + 1;
      i++;
    }
    return sql.length;
  }
  if (open === "$" && dialect !== "mysql") {
    const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(start, start + 64));
    if (tag) {
      const close = sql.indexOf(tag[0], start + tag[0].length);
      return close < 0 ? sql.length : close + tag[0].length;
    }
  }
  return start;
}

export function isEscapeString(sql: string, quote: number): boolean {
  return (
    sql[quote] === "'" &&
    /[eE]/.test(sql[quote - 1] ?? "") &&
    !/\w/.test(sql[quote - 2] ?? "")
  );
}

// pg_dump writes table data as tab-separated lines between COPY … FROM stdin;
// and a \. line. They are not SQL: an apostrophe in a name would open a string.
const COPY_FROM_STDIN = /COPY\b[^;]*?\bFROM\s+stdin\s*;/iy;

export function stripComments(sql: string, dialect: DbType | null = null): string {
  let out = "";
  let from = 0;
  let i = 0;
  let lineStart = true;
  const skipTo = (to: number) => {
    out += sql.slice(from, i);
    i = to;
    from = to;
  };
  while (i < sql.length) {
    const quoted = quoteEnd(sql, i, dialect);
    if (quoted > i) {
      i = quoted;
      lineStart = false;
      continue;
    }
    const ch = sql[i];
    if (ch === "\n") {
      lineStart = true;
      i++;
      continue;
    }
    if (lineStart && dialect !== "mysql") {
      COPY_FROM_STDIN.lastIndex = i;
      if (COPY_FROM_STDIN.test(sql)) {
        const data = sql.indexOf("\n\\.", COPY_FROM_STDIN.lastIndex);
        const end = data < 0 ? -1 : sql.indexOf("\n", data + 1);
        skipTo(data < 0 || end < 0 ? sql.length : end);
        continue;
      }
    }
    const lineComment =
      sql.startsWith("--", i) ||
      (ch === "#" && dialect === "mysql") ||
      // psql meta-commands such as pg_dump's \restrict lines
      (ch === "\\" && lineStart && dialect !== "mysql");
    if (lineComment) {
      const end = sql.indexOf("\n", i);
      skipTo(end < 0 ? sql.length : end);
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      skipTo(end < 0 ? sql.length : end + 2);
      continue;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\r") lineStart = false;
    i++;
  }
  return out + sql.slice(from);
}

export function withoutStrings(sql: string, dialect: DbType | null = null): string {
  let out = "";
  let from = 0;
  let i = 0;
  while (i < sql.length) {
    const end = quoteEnd(sql, i, dialect);
    if (end === i) {
      i++;
      continue;
    }
    if (sql[i] === "'") {
      out += `${sql.slice(from, i)}''`;
      from = end;
    }
    i = end;
  }
  return out + sql.slice(from);
}

export function splitTopLevel(
  text: string,
  separator: string,
  dialect: DbType | null = null,
  { ignoreParens = false } = {},
): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  let i = 0;
  while (i < text.length) {
    const quoted = quoteEnd(text, i, dialect);
    if (quoted > i) {
      i = quoted;
      continue;
    }
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === separator && (depth === 0 || ignoreParens)) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
    i++;
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

// A stray parenthesis must not swallow the rest of the file.
export function splitStatements(sql: string, dialect: DbType | null = null): string[] {
  return splitTopLevel(sql, ";", dialect, { ignoreParens: true });
}

export function matchingParen(
  text: string,
  open: number,
  dialect: DbType | null,
): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const quoted = quoteEnd(text, i, dialect);
    if (quoted > i) {
      i = quoted;
      continue;
    }
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i;
    i++;
  }
  return -1;
}

export interface Token {
  text: string;
  upper: string;
  start: number;
  end: number;
}

const BREAK_BEFORE_PAREN = new Set([
  "AS",
  "CHECK",
  "DEFAULT",
  "IDENTITY",
  "INDEX",
  "KEY",
  "UNIQUE",
]);

export function tokenize(text: string, dialect: DbType | null): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    const start = i;
    while (i < text.length && !/\s/.test(text[i])) {
      const quoted = quoteEnd(text, i, dialect);
      if (quoted > i) {
        i = quoted;
        continue;
      }
      if (text[i] === "(") {
        if (i > start && BREAK_BEFORE_PAREN.has(text.slice(start, i).toUpperCase()))
          break;
        const close = matchingParen(text, i, dialect);
        i = close < 0 ? text.length : close + 1;
        continue;
      }
      i++;
    }
    const tokenText = text.slice(start, i);
    tokens.push({ text: tokenText, upper: tokenText.toUpperCase(), start, end: i });
  }
  return tokens;
}

const NAME_PART = /`(?:[^`]|``)*`|"(?:[^"]|"")*"|[A-Za-z_$][\w$]*/;
export const NAME_PATTERN = String.raw`(?:${NAME_PART.source})(?:\s*\.\s*(?:${NAME_PART.source}))*`;
const QUALIFIED_NAME = new RegExp(`^\\s*${NAME_PATTERN}`);

function unquote(part: string): string {
  if (part.startsWith("`")) return part.slice(1, -1).replace(/``/g, "`");
  if (part.startsWith('"')) return part.slice(1, -1).replace(/""/g, '"');
  return part;
}

export interface Name {
  parts: string[];
  last: string;
  schema: string | null;
  length: number;
}

export function readName(text: string): Name | null {
  const match = QUALIFIED_NAME.exec(text);
  if (!match) return null;
  const parts = [...match[0].matchAll(new RegExp(NAME_PART.source, "g"))].map((m) =>
    unquote(m[0]),
  );
  return {
    parts,
    last: parts[parts.length - 1],
    schema: parts.length > 1 ? parts[parts.length - 2] : null,
    length: match[0].length,
  };
}

export const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// A name without a schema is in PostgreSQL's default one.
export const sameSchema = (a: string | null, b: string | null) =>
  sameName(a ?? "public", b ?? "public");
