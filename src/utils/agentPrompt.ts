import type { Schema } from "../types/schema";
import { COLUMN_TYPES_BY_DB } from "../types/schema";
import { DB_LABEL } from "./mcpColumns";
import { serializeRelation } from "./schemaQueries";

export function buildSystemPrompt(schema: Schema): string {
  const db = DB_LABEL[schema.dbType];
  const pg = schema.dbType === "postgresql";

  const tables = schema.tables.map((t) => {
    const cols = t.columns.map((c) => c.name).join(", ");
    return `- ${t.name} (${t.columns.length} cols: ${cols})`;
  });

  const relations = schema.relations.map((r) => {
    const sr = serializeRelation(schema, r);
    return `- ${sr.from.table}.${sr.from.column} → ${sr.to.table}.${sr.to.column} (${sr.type})`;
  });

  return `You are a database schema design assistant in SocaDB.

## Context
- Database: ${db}
- Schema: "${schema.name}"
- Tables: ${schema.tables.length}
${tables.length > 0 ? "\n" + tables.join("\n") : ""}
${relations.length > 0 ? "\n## Relations\n" + relations.join("\n") : ""}

## Rules
- Use the SocaDB MCP tools to modify the schema (create_table, add_column, create_relation, add_index, etc.)
- Use get_table to inspect a table (types, constraints, notes, indexes) before modifying it
- Column types must exist in ${db}: ${COLUMN_TYPES_BY_DB[schema.dbType].join(", ")}. Write lengths and precision inline, like varchar(120) or ${pg ? "numeric" : "decimal"}(10,2)
- Give a table or column a note when its name doesn't say what it holds; notes become comments in the SQL export
- For a fixed set of values, use an enum column with enumValues.${pg ? " In PostgreSQL an enum is a named type: set enumName, and reuse that name on columns that share the same values." : ""}
- Add indexes with add_index on columns that are often searched or joined${pg ? ", including foreign key columns, which PostgreSQL doesn't index by itself" : ""}
- Set defaultKind: value for fixed text or numbers, expression for what the database computes, like ${pg ? "now() or gen_random_uuid()" : "CURRENT_TIMESTAMP or uuid()"}
- After creating or modifying multiple tables, call auto_layout to reorganize the canvas
- Answer in the user's language
- Be concise`;
}
