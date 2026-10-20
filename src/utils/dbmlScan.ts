export type DbmlTokenKind =
  | "word"
  | "quoted"
  | "string"
  | "expr"
  | "number"
  | "color"
  | "op"
  | "punct";

export interface DbmlToken {
  kind: DbmlTokenKind;
  value: string;
  line: number;
  start: number;
  end: number;
}

export class DbmlSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`DBML line ${line}: ${message}`);
  }
}

const WORD = /[\p{L}\p{N}_]/u;

function dedent(text: string): string {
  const lines = text
    .replace(/^\r?\n/, "")
    .replace(/\s+$/, "")
    .split(/\r?\n/);
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => /^[ \t]*/.exec(l)?.[0].length ?? 0);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(common)).join("\n");
}

// DBML escapes only the backslash and the quote, and a backslash ending a line
// joins the next one: \n stays as written.
function unescape(text: string, quote: string): string {
  return text.replace(/\\(\r?\n|.)/gs, (all, ch: string) =>
    ch === "\\" || ch === quote ? ch : ch.endsWith("\n") ? "" : all,
  );
}

export function tokenizeDbml(source: string): DbmlToken[] {
  const tokens: DbmlToken[] = [];
  let i = 0;
  let line = 1;
  const push = (kind: DbmlTokenKind, value: string, start: number, startLine: number) =>
    tokens.push({ kind, value, line: startLine, start, end: i });
  const until = (close: string, from: number): number => {
    for (let j = from; j < source.length; j++) {
      if (source[j] === "\\") {
        j++;
        continue;
      }
      if (source.startsWith(close, j)) return j;
    }
    throw new DbmlSyntaxError(`missing closing ${close}`, line);
  };
  const advance = (to: number) => {
    for (let j = i; j < to; j++) if (source[j] === "\n") line++;
    i = to;
  };

  while (i < source.length) {
    const ch = source[i];
    const start = i;
    const startLine = line;
    if (/\s/.test(ch)) {
      advance(i + 1);
    } else if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      advance(end < 0 ? source.length : end);
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new DbmlSyntaxError("missing closing */", line);
      advance(end + 2);
    } else if (source.startsWith("'''", i)) {
      const end = until("'''", i + 3);
      advance(end + 3);
      push(
        "string",
        unescape(dedent(source.slice(start + 3, end)), "'"),
        start,
        startLine,
      );
    } else if (ch === "'" || ch === '"' || ch === "`") {
      const end = until(ch, i + 1);
      advance(end + 1);
      const text = source.slice(start + 1, end);
      const kind = ch === "'" ? "string" : ch === '"' ? "quoted" : "expr";
      push(kind, kind === "expr" ? text : unescape(text, ch), start, startLine);
    } else if (ch === "#" && /^#[0-9a-fA-F]{3,8}\b/.test(source.slice(i, i + 10))) {
      const match = /^#[0-9a-fA-F]{3,8}/.exec(source.slice(i));
      advance(i + (match?.[0].length ?? 1));
      push("color", source.slice(start, i), start, startLine);
    } else if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^-?\d+(?:\.\d+)?/.exec(source.slice(i));
      advance(i + (match?.[0].length ?? 1));
      if (WORD.test(source[i] ?? "")) {
        while (i < source.length && WORD.test(source[i])) advance(i + 1);
        push("word", source.slice(start, i), start, startLine);
      } else {
        push("number", source.slice(start, i), start, startLine);
      }
    } else if (WORD.test(ch)) {
      while (i < source.length && WORD.test(source[i])) advance(i + 1);
      push("word", source.slice(start, i), start, startLine);
    } else if (source.startsWith("<>", i)) {
      advance(i + 2);
      push("op", "<>", start, startLine);
    } else if (ch === "<" || ch === ">" || ch === "-") {
      advance(i + 1);
      push("op", ch, start, startLine);
    } else {
      // Blocks SocaDB doesn't read can hold any character; the parser skips them.
      advance(i + 1);
      push("punct", ch, start, startLine);
    }
  }
  return tokens;
}
