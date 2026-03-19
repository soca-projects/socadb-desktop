import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSchemaStore } from "../stores/schemaStore";
import { genId } from "../utils/id";
import { createDefaultIdColumn } from "../utils/columnDefaults";
import { getNextTableColor } from "../utils/tableColors";
import { computeAutoLayout } from "../utils/autoLayout";
import type { Column } from "../types/schema";

interface McpRequest {
  id: number;
  action: string;
  payload?: Record<string, unknown>;
}

function findTableByName(name: string) {
  const { schema } = useSchemaStore.getState();
  return schema.tables.find((t) => t.name === name);
}

function serializeColumn(c: Column) {
  return {
    name: c.name,
    type: c.type,
    isPrimaryKey: c.isPrimaryKey,
    isForeignKey: c.isForeignKey,
    isNullable: c.isNullable,
    isUnique: c.isUnique,
    isAutoIncrement: c.isAutoIncrement,
    defaultValue: c.defaultValue,
  };
}

function respond(id: number, result: unknown, error?: string) {
  const msg = error ? { id, error } : { id, result };
  void invoke("mcp_respond", { response: JSON.stringify(msg) });
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
}

function handleRequest(req: McpRequest) {
  const store = useSchemaStore.getState();
  const { schema } = store;
  const p = req.payload ?? {};

  switch (req.action) {
    case "get_schema": {
      respond(req.id, {
        name: schema.name,
        dbType: schema.dbType,
        tables: schema.tables.map((t) => ({
          name: t.name,
          columns: t.columns.map(serializeColumn),
        })),
        relations: schema.relations.map((r) => {
          const fromTable = schema.tables.find((t) => t.id === r.from.tableId);
          const toTable = schema.tables.find((t) => t.id === r.to.tableId);
          const fromCol = fromTable?.columns.find((c) => c.id === r.from.columnId);
          const toCol = toTable?.columns.find((c) => c.id === r.to.columnId);
          return {
            type: r.type,
            from: { table: fromTable?.name, column: fromCol?.name },
            to: { table: toTable?.name, column: toCol?.name },
          };
        }),
      });
      break;
    }

    case "get_table": {
      const name = getString(p, "name");
      if (!name) {
        respond(req.id, null, "Missing name");
        break;
      }
      const table = findTableByName(name);
      respond(
        req.id,
        table
          ? {
              name: table.name,
              columns: table.columns.map(serializeColumn),
            }
          : null,
      );
      break;
    }

    case "get_editor_state": {
      respond(req.id, {
        filePath: store.filePath,
        schemaName: schema.name,
        dbType: schema.dbType,
        tableCount: schema.tables.length,
        relationCount: schema.relations.length,
      });
      break;
    }

    case "create_table": {
      const name = getString(p, "name");
      if (!name) {
        respond(req.id, null, "Missing name");
        break;
      }
      const rawColumns = (Array.isArray(p.columns) ? p.columns : []) as Record<
        string,
        unknown
      >[];
      const tableId = genId();
      const columns: Column[] =
        rawColumns.length > 0
          ? rawColumns.map((c) => ({
              id: genId(),
              name: c.name as string,
              type: (c.type as Column["type"]) ?? "varchar",
              isPrimaryKey: (c.isPrimaryKey as boolean) ?? false,
              isForeignKey: false,
              isNullable: (c.isNullable as boolean) ?? true,
              isUnique: (c.isUnique as boolean) ?? false,
              isAutoIncrement: (c.isAutoIncrement as boolean) ?? false,
              defaultValue: (c.defaultValue as string) ?? null,
            }))
          : [createDefaultIdColumn(schema.dbType)];

      const tables = schema.tables;
      store.addTable({
        id: tableId,
        name,
        color: getNextTableColor(tables),
        position: { x: 100 + tables.length * 50, y: 100 + tables.length * 50 },
        columns,
      });
      respond(req.id, true);
      break;
    }

    case "update_table": {
      const name = getString(p, "name");
      if (!name) {
        respond(req.id, null, "Missing name");
        break;
      }
      const table = findTableByName(name);
      if (!table) {
        respond(req.id, false);
        break;
      }
      const updates: Partial<{ name: string; color: string }> = {};
      const newName = getString(p, "newName");
      const color = getString(p, "color");
      if (newName) updates.name = newName;
      if (color) updates.color = color;
      if (Object.keys(updates).length === 0) {
        respond(req.id, null, "Missing newName or color");
        break;
      }
      store.updateTable(table.id, updates);
      respond(req.id, true);
      break;
    }

    case "delete_table": {
      const name = getString(p, "name");
      if (!name) {
        respond(req.id, null, "Missing name");
        break;
      }
      const table = findTableByName(name);
      if (!table) {
        respond(req.id, false);
        break;
      }
      store.deleteTable(table.id);
      respond(req.id, true);
      break;
    }

    case "add_column": {
      const tableName = getString(p, "table");
      if (!tableName || typeof p.column !== "object" || !p.column) {
        respond(req.id, null, "Missing table or column");
        break;
      }
      const table = findTableByName(tableName);
      if (!table) {
        respond(req.id, false);
        break;
      }
      const col = p.column as Record<string, unknown>;
      store.addColumn(table.id, {
        id: genId(),
        name: col.name as string,
        type: (col.type as Column["type"]) ?? "varchar",
        isPrimaryKey: (col.isPrimaryKey as boolean) ?? false,
        isForeignKey: false,
        isNullable: (col.isNullable as boolean) ?? true,
        isUnique: (col.isUnique as boolean) ?? false,
        isAutoIncrement: (col.isAutoIncrement as boolean) ?? false,
        defaultValue: (col.defaultValue as string) ?? null,
      });
      respond(req.id, true);
      break;
    }

    case "update_column": {
      const tableName = getString(p, "table");
      const colName = getString(p, "column");
      if (!tableName || !colName) {
        respond(req.id, null, "Missing table or column");
        break;
      }
      const table = findTableByName(tableName);
      if (!table) {
        respond(req.id, false);
        break;
      }
      const col = table.columns.find((c) => c.name === colName);
      if (!col) {
        respond(req.id, false);
        break;
      }
      store.updateColumn(table.id, col.id, p.updates as Partial<Column>);
      respond(req.id, true);
      break;
    }

    case "delete_column": {
      const tableName = getString(p, "table");
      const colName = getString(p, "column");
      if (!tableName || !colName) {
        respond(req.id, null, "Missing table or column");
        break;
      }
      const table = findTableByName(tableName);
      if (!table) {
        respond(req.id, false);
        break;
      }
      const col = table.columns.find((c) => c.name === colName);
      if (!col) {
        respond(req.id, false);
        break;
      }
      store.deleteColumn(table.id, col.id);
      respond(req.id, true);
      break;
    }

    case "create_relation": {
      const fromTableName = getString(p, "fromTable");
      const toTableName = getString(p, "toTable");
      const fromColName = getString(p, "fromColumn");
      const toColName = getString(p, "toColumn");
      if (!fromTableName || !toTableName || !fromColName || !toColName) {
        respond(req.id, null, "Missing fromTable, toTable, fromColumn, or toColumn");
        break;
      }
      const fromTable = findTableByName(fromTableName);
      const toTable = findTableByName(toTableName);
      if (!fromTable || !toTable) {
        respond(req.id, false);
        break;
      }
      const fromCol = fromTable.columns.find((c) => c.name === fromColName);
      const toCol = toTable.columns.find((c) => c.name === toColName);
      if (!fromCol || !toCol) {
        respond(req.id, false);
        break;
      }
      store.addRelation({
        id: genId(),
        from: { tableId: fromTable.id, columnId: fromCol.id },
        to: { tableId: toTable.id, columnId: toCol.id },
        type: (p.type as "1:1" | "1:N" | "N:1") ?? "1:N",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      respond(req.id, true);
      break;
    }

    case "delete_relation": {
      const fromTableName = getString(p, "fromTable");
      const toTableName = getString(p, "toTable");
      const fromColName = getString(p, "fromColumn");
      const toColName = getString(p, "toColumn");
      if (!fromTableName || !toTableName || !fromColName || !toColName) {
        respond(req.id, null, "Missing fromTable, toTable, fromColumn, or toColumn");
        break;
      }
      const fromTable = findTableByName(fromTableName);
      const toTable = findTableByName(toTableName);
      if (!fromTable || !toTable) {
        respond(req.id, false);
        break;
      }
      const fromCol = fromTable.columns.find((c) => c.name === fromColName);
      const toCol = toTable.columns.find((c) => c.name === toColName);
      if (!fromCol || !toCol) {
        respond(req.id, false);
        break;
      }
      const relation = schema.relations.find(
        (r) =>
          r.from.tableId === fromTable.id &&
          r.from.columnId === fromCol.id &&
          r.to.tableId === toTable.id &&
          r.to.columnId === toCol.id,
      );
      if (!relation) {
        respond(req.id, false);
        break;
      }
      store.deleteRelation(relation.id);
      respond(req.id, true);
      break;
    }

    case "auto_layout": {
      void computeAutoLayout(schema.tables, schema.relations)
        .then((positions) => {
          store.updateTablePositions(positions);
          respond(req.id, true);
        })
        .catch(() => {
          respond(req.id, null, "Auto-layout failed");
        });
      break;
    }

    default:
      respond(req.id, null, `Unknown action: ${req.action}`);
  }
}

export function useMcpBridge() {
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<string>("mcp-request", (event) => {
      if (cancelled) return;
      try {
        const req = JSON.parse(event.payload) as McpRequest;
        handleRequest(req);
      } catch (e) {
        console.error("Failed to handle MCP request:", e);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);
}
