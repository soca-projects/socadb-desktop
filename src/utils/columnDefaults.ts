import type { Column, DbType, DefaultKind } from "../types/schema";
import { genId } from "./id";

export function createDefaultIdColumn(dbType: DbType): Column {
  return dbType === "mysql"
    ? {
        id: genId(),
        name: "id",
        type: "int",
        isPrimaryKey: true,
        isForeignKey: false,
        isNullable: false,
        isUnique: true,
        isAutoIncrement: true,
        defaultValue: null,
      }
    : {
        id: genId(),
        name: "id",
        type: "uuid",
        isPrimaryKey: true,
        isForeignKey: false,
        isNullable: false,
        isUnique: true,
        isAutoIncrement: false,
        defaultValue: "gen_random_uuid()",
      };
}

const EXPRESSION_DEFAULT =
  /^(?:current_timestamp|current_date|current_time|localtimestamp|localtime|null|[a-z_][\w.]*\(.*\))$/is;

// Files saved before defaultKind existed hold either a bare value or an
// expression. A value someone already wrapped in quotes is written as is.
export function defaultKindOf(column: Column): DefaultKind {
  if (column.defaultKind) return column.defaultKind;
  const value = column.defaultValue?.trim() ?? "";
  return /^'.*'$/s.test(value) || EXPRESSION_DEFAULT.test(value) ? "expression" : "value";
}
