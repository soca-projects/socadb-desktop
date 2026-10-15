import type { DbType, DefaultKind } from "../types/schema";
import { matchingParen, quoteEnd } from "./sqlScan";

const ESCAPES: Record<string, string> = {
  "0": "\0",
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
};

function decodeString(literal: string, escapes: "none" | "mysql" | "c"): string {
  const quote = literal[0];
  const inner = literal.slice(1, -1);
  if (escapes === "none") return inner.split(quote + quote).join(quote);
  const pattern = quote === "'" ? /\\(.)|''/gs : /\\(.)|""/gs;
  return inner.replace(pattern, (_, ch: string | undefined) => {
    if (ch === undefined) return quote;
    // MySQL keeps the backslash of \% and \_, which only mean something in LIKE.
    if (escapes === "mysql" && (ch === "%" || ch === "_")) return `\\${ch}`;
    return ESCAPES[ch] ?? ch;
  });
}

// MySQL may put a charset introducer before a literal: _utf8mb4'x'.
export function readLiteral(text: string, dialect: DbType | null): string | null {
  const trimmed = text.trim().replace(/^_[a-z0-9]+(?=')/i, "");
  const escapeString = dialect !== "mysql" && /^[eE]'/.test(trimmed);
  const start = escapeString ? 1 : 0;
  const opens = trimmed[start] === "'" || (trimmed[start] === '"' && dialect === "mysql");
  if (!opens || quoteEnd(trimmed, start, dialect) !== trimmed.length) return null;
  const escapes = escapeString ? "c" : dialect === "postgresql" ? "none" : "mysql";
  return decodeString(trimmed.slice(start), escapes);
}

const CASTS =
  /^(?:\s*::\s*(?:"[^"]+"|[a-z_][\w$]*)(?:\.(?:"[^"]+"|[a-z_][\w$]*))*(?:\s+(?:varying|precision|with(?:out)?\s+time\s+zone))?(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\[\])*)+\s*$/i;

// pg_dump writes every literal default with a cast: 'draft'::character varying.
function withoutCasts(text: string, dialect: DbType | null): string {
  if (dialect === "mysql") return text;
  for (let i = 1; i < text.length; i++) {
    if (text[i] !== ":" || text[i - 1] !== ":" || !CASTS.test(text.slice(i - 1)))
      continue;
    const head = text.slice(0, i - 1).trim();
    if (
      readLiteral(head, dialect) !== null ||
      /^(?:[-+]?\d+(?:\.\d+)?|null)$/i.test(head)
    )
      return head;
  }
  return text;
}

export function readDefault(
  raw: string,
  dialect: DbType | null,
): { value: string | null; kind?: DefaultKind } {
  let text = withoutCasts(raw.trim(), dialect);
  const wrapped = /^\((.*)\)$/s.exec(text);
  if (wrapped && readLiteral(wrapped[1], dialect) !== null) text = wrapped[1].trim();
  if (/^null$/i.test(text)) return { value: null };
  // Without the dialect, a backslash may or may not be an escape: such a default
  // keeps its quotes and goes back out as written.
  if (dialect === null && text.includes("\\")) return { value: text, kind: "expression" };
  const literal = readLiteral(text, dialect);
  if (literal !== null) return { value: literal, kind: "value" };
  if (/^[-+]?\d+(?:\.\d+)?$|^(?:true|false)$/i.test(text))
    return { value: text, kind: "value" };
  // MySQL needs its expression defaults in parentheses and the export adds them
  // back; PostgreSQL needs the ones pg_dump writes around AT TIME ZONE and others.
  if (
    dialect === "mysql" &&
    wrapped &&
    matchingParen(text, 0, dialect) === text.length - 1
  )
    return { value: wrapped[1].trim(), kind: "expression" };
  return { value: text, kind: "expression" };
}
