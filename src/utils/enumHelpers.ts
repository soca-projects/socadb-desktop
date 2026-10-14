import type { Schema } from "../types/schema";

export function parseValueList(raw: string): string[] {
  return raw
    .split(/[,\n\r\t]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function addValues(existing: string[], raw: string): string[] {
  const next = [...existing];
  for (const value of parseValueList(raw)) {
    if (!next.includes(value)) next.push(value);
  }
  return next;
}

export type EnumNameError = "empty" | "table" | "enum";

// PostgreSQL gives every table a type of the same name, so CREATE TYPE would
// fail on a table's name as well as on another enum's.
export function enumNameError(
  schema: Schema,
  enumId: string,
  name: string,
): EnumNameError | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (schema.tables.some((t) => t.name === trimmed)) return "table";
  if ((schema.enums ?? []).some((e) => e.id !== enumId && e.name === trimmed))
    return "enum";
  return null;
}
