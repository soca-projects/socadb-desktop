export type DbType = "mysql" | "postgresql";

export type ColumnType =
  // MySQL types
  | "int"
  | "bigint"
  | "tinyint"
  | "smallint"
  | "mediumint"
  | "float"
  | "double"
  | "decimal"
  | "varchar"
  | "char"
  | "text"
  | "mediumtext"
  | "longtext"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "timestamp"
  | "json"
  | "enum"
  | "blob"
  // PostgreSQL types
  | "integer"
  | "real"
  | "double precision"
  | "numeric"
  | "timestamptz"
  | "uuid"
  | "serial"
  | "bigserial"
  | "jsonb"
  | "bytea";

export const MYSQL_COLUMN_TYPES: ColumnType[] = [
  "int",
  "bigint",
  "tinyint",
  "smallint",
  "mediumint",
  "float",
  "double",
  "decimal",
  "varchar",
  "char",
  "text",
  "mediumtext",
  "longtext",
  "boolean",
  "date",
  "time",
  "datetime",
  "timestamp",
  "json",
  "enum",
  "blob",
];

export const POSTGRESQL_COLUMN_TYPES: ColumnType[] = [
  "integer",
  "bigint",
  "smallint",
  "real",
  "double precision",
  "numeric",
  "varchar",
  "char",
  "text",
  "boolean",
  "date",
  "time",
  "timestamp",
  "timestamptz",
  "uuid",
  "serial",
  "bigserial",
  "json",
  "jsonb",
  "bytea",
];

export const COLUMN_TYPES_BY_DB: Record<DbType, ColumnType[]> = {
  mysql: MYSQL_COLUMN_TYPES,
  postgresql: POSTGRESQL_COLUMN_TYPES,
};

export const LENGTH_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "varchar",
  "char",
]);
export const PRECISION_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "decimal",
  "numeric",
]);

export type DefaultKind = "value" | "expression";

export type RelationType = "1:1" | "1:N" | "N:1";

export type ReferentialAction = "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isAutoIncrement: boolean;
  defaultValue: string | null;
  defaultKind?: DefaultKind;
  length?: number;
  precision?: number;
  scale?: number;
  enumId?: string;
  note?: string;
}

export interface TableIndex {
  id: string;
  columnIds: string[];
  unique: boolean;
  name?: string;
}

// The new fields are optional so a file that uses none of them is saved
// unchanged: users commit .soca files and read the diffs.
export interface Table {
  id: string;
  name: string;
  color?: string;
  position: { x: number; y: number };
  columns: Column[];
  note?: string;
  indexes?: TableIndex[];
}

export interface SchemaEnum {
  id: string;
  name: string;
  values: string[];
}

export interface Relation {
  id: string;
  from: { tableId: string; columnId: string };
  to: { tableId: string; columnId: string };
  type: RelationType;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface Schema {
  version: string;
  name: string;
  dbType: DbType;
  createdAt: string;
  updatedAt: string;
  tables: Table[];
  relations: Relation[];
  enums?: SchemaEnum[];
}
