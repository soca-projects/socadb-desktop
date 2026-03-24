import type { Column, DbType } from "../types/schema";
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
