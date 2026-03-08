export type ColumnType =
  | "uuid"
  | "serial"
  | "int"
  | "bigint"
  | "float"
  | "decimal"
  | "varchar"
  | "text"
  | "char"
  | "boolean"
  | "date"
  | "time"
  | "timestamp"
  | "datetime"
  | "json"
  | "jsonb"
  | "blob";

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
  defaultValue: string | null;
}

export interface Table {
  id: string;
  name: string;
  position: { x: number; y: number };
  columns: Column[];
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
  createdAt: string;
  updatedAt: string;
  tables: Table[];
  relations: Relation[];
}
