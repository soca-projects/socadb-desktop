import type { Column, DbType, Schema, SchemaEnum, Table } from "../types/schema";
import { LENGTH_TYPES, MYSQL_NUMERIC_TYPES, PRECISION_TYPES } from "../types/schema";
import { genId } from "./id";

// PostgreSQL gives every table a row type of the same name, so an enum cannot
// reuse a table's name: CREATE TYPE would fail.
export function uniqueEnumName(
  base: string,
  enums: SchemaEnum[],
  tableNames: string[] = [],
): string {
  const taken = new Set([...enums.map((e) => e.name), ...tableNames]);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function renameEnumsAgainst(
  existing: SchemaEnum[],
  incoming: SchemaEnum[],
  tableNames: string[] = [],
): SchemaEnum[] {
  const taken = [...existing];
  return incoming.map((e) => {
    const renamed = { ...e, name: uniqueEnumName(e.name, taken, tableNames) };
    taken.push(renamed);
    return renamed;
  });
}

// Every "enum" column must point to an enum the editor and the exporter can
// read: legacy files, SQL imports and the agent can all produce one without.
export function linkEnumColumns(
  tables: Table[],
  enums: SchemaEnum[],
): { tables: Table[]; enums: SchemaEnum[] } {
  const known = new Set(enums.map((e) => e.id));
  const added: SchemaEnum[] = [];
  let changed = false;
  const nextTables = tables.map((t) => {
    let tableChanged = false;
    const columns = t.columns.map((c) => {
      if (c.type === "enum") {
        if (c.enumId && known.has(c.enumId)) return c;
        const created: SchemaEnum = {
          id: genId(),
          name: uniqueEnumName(
            `${t.name}_${c.name}`,
            [...enums, ...added],
            tables.map((x) => x.name),
          ),
          values: [],
        };
        added.push(created);
        known.add(created.id);
        tableChanged = true;
        return { ...c, enumId: created.id };
      }
      if (c.enumId === undefined) return c;
      tableChanged = true;
      const rest = { ...c };
      delete rest.enumId;
      return rest;
    });
    if (!tableChanged) return t;
    changed = true;
    return { ...t, columns };
  });
  return changed
    ? { tables: nextTables, enums: [...enums, ...added] }
    : { tables, enums };
}

export function pruneIndexes(tables: Table[]): Table[] {
  let changed = false;
  const next = tables.map((t) => {
    const current = t.indexes;
    if (!current?.length) return t;
    const columnIds = new Set(t.columns.map((c) => c.id));
    const indexes = current
      .map((i) =>
        i.columnIds.every((id) => columnIds.has(id))
          ? i
          : { ...i, columnIds: i.columnIds.filter((id) => columnIds.has(id)) },
      )
      .filter((i) => i.columnIds.length > 0);
    if (indexes.length === current.length && indexes.every((i, k) => i === current[k]))
      return t;
    changed = true;
    return { ...t, indexes };
  });
  return changed ? next : tables;
}

function withoutStaleFields(c: Column, dbType: DbType | undefined): Column {
  const { length, precision, scale, defaultKind, unsigned, ...base } = c;
  const decimal = PRECISION_TYPES.has(c.type);
  const next: Column = { ...base };
  if (length !== undefined && LENGTH_TYPES.has(c.type)) next.length = length;
  if (precision !== undefined && decimal) next.precision = precision;
  if (scale !== undefined && decimal && precision !== undefined) next.scale = scale;
  if (defaultKind !== undefined && c.defaultValue !== null)
    next.defaultKind = defaultKind;
  if (unsigned && dbType !== "postgresql" && MYSQL_NUMERIC_TYPES.has(c.type))
    next.unsigned = true;
  return next;
}

const EXTRA_FIELDS = ["length", "precision", "scale", "defaultKind", "unsigned"] as const;

export function pruneColumnFields(tables: Table[], dbType?: DbType): Table[] {
  let changed = false;
  const next = tables.map((t) => {
    let tableChanged = false;
    const columns = t.columns.map((c) => {
      const clean = withoutStaleFields(c, dbType);
      if (EXTRA_FIELDS.every((key) => clean[key] === c[key])) return c;
      tableChanged = true;
      return clean;
    });
    if (!tableChanged) return t;
    changed = true;
    return { ...t, columns };
  });
  return changed ? next : tables;
}

function enumIdsInUse(tables: Table[]): Set<string> {
  return new Set(
    tables.flatMap((t) => t.columns.flatMap((c) => (c.enumId ? [c.enumId] : []))),
  );
}

// Only enums that this change left unused go: an enum that was already unused
// when the file loaded (an imported CREATE TYPE) is the user's to delete.
export function dropEnumsLeftUnused(
  before: Table[],
  after: Table[],
  enums: SchemaEnum[],
): SchemaEnum[] {
  if (before === after || enums.length === 0) return enums;
  const usedBefore = enumIdsInUse(before);
  const usedAfter = enumIdsInUse(after);
  const kept = enums.filter((e) => !usedBefore.has(e.id) || usedAfter.has(e.id));
  return kept.length === enums.length ? enums : kept;
}

const NO_ENUMS: SchemaEnum[] = [];

export function normalizeSchema(schema: Schema, prev?: Schema): Schema {
  const current = schema.enums ?? NO_ENUMS;
  const linked = linkEnumColumns(schema.tables, current);
  const tables = pruneColumnFields(pruneIndexes(linked.tables), schema.dbType);
  const enums = prev
    ? dropEnumsLeftUnused(prev.tables, tables, linked.enums)
    : linked.enums;
  if (tables === schema.tables && enums === current) return schema;
  return enums === current ? { ...schema, tables } : { ...schema, tables, enums };
}
