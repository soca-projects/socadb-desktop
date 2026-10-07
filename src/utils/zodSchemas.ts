import { z } from "zod";

export const DbTypeZ = z.enum(["mysql", "postgresql"]);

export const ColumnTypeZ = z.enum([
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
  "integer",
  "real",
  "double precision",
  "numeric",
  "timestamptz",
  "uuid",
  "serial",
  "bigserial",
  "jsonb",
  "bytea",
]);

export const RelationTypeZ = z.enum(["1:1", "1:N", "N:1"]);
export const ReferentialActionZ = z.enum([
  "CASCADE",
  "SET NULL",
  "RESTRICT",
  "NO ACTION",
]);

export const ColumnZ = z.object({
  id: z.string(),
  name: z.string(),
  type: ColumnTypeZ,
  isPrimaryKey: z.boolean(),
  isForeignKey: z.boolean(),
  isNullable: z.boolean(),
  isUnique: z.boolean(),
  isAutoIncrement: z.boolean(),
  defaultValue: z.string().nullable(),
});

const PositionZ = z.object({ x: z.number(), y: z.number() });

export const TableZ = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  position: PositionZ,
  columns: z.array(ColumnZ),
});

const RelationEndpointZ = z.object({
  tableId: z.string(),
  columnId: z.string(),
});

export const RelationZ = z.object({
  id: z.string(),
  from: RelationEndpointZ,
  to: RelationEndpointZ,
  type: RelationTypeZ,
  onDelete: ReferentialActionZ,
  onUpdate: ReferentialActionZ,
});

export const SchemaZ = z.object({
  version: z.string(),
  name: z.string(),
  dbType: DbTypeZ,
  createdAt: z.string(),
  updatedAt: z.string(),
  tables: z.array(TableZ),
  relations: z.array(RelationZ),
});

export const McpColumnInputZ = z.object({
  name: z.string(),
  type: z.string().optional(),
  isPrimaryKey: z.boolean().optional(),
  isNullable: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isAutoIncrement: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
});

export const McpCreateTableZ = z.object({
  name: z.string(),
  columns: z.array(McpColumnInputZ).optional(),
});

export const McpUpdateTableZ = z.object({
  name: z.string(),
  newName: z.string().optional(),
  color: z.string().optional(),
});

export const McpTableNameZ = z.object({
  name: z.string(),
});

export const McpAddColumnZ = z.object({
  table: z.string(),
  column: McpColumnInputZ,
});

export const McpColumnUpdateZ = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  isPrimaryKey: z.boolean().optional(),
  isNullable: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isAutoIncrement: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
});

export const McpUpdateColumnZ = z.object({
  table: z.string(),
  column: z.string(),
  updates: McpColumnUpdateZ,
});

export const McpDeleteColumnZ = z.object({
  table: z.string(),
  column: z.string(),
});

export const McpRelationEndpointsZ = z.object({
  fromTable: z.string(),
  fromColumn: z.string(),
  toTable: z.string(),
  toColumn: z.string(),
});

export const McpCreateRelationZ = McpRelationEndpointsZ.extend({
  type: RelationTypeZ.optional(),
});

export const ChatErrorZ = z.object({
  message: z.string(),
  code: z.enum(["auth", "model_unavailable"]).optional(),
  model: z.string().optional(),
});

export const McpClientConfigZ = z.looseObject({
  mcpServers: z.record(z.string(), z.unknown()).optional(),
});

export const McpServerEntryZ = z.looseObject({
  command: z.string().optional(),
});

const ToolCallInfoZ = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
  result: z.string().nullable(),
  isSuccess: z.boolean(),
});

export const ChatMessageZ = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  toolCalls: z.array(ToolCallInfoZ),
  timestamp: z.string(),
});

export const ConversationZ = z.object({
  id: z.string(),
  name: z.string(),
  nameEdited: z.boolean().optional(),
  provider: z.enum(["claude", "codex"]).optional(),
  model: z.string().optional(),
  sessionId: z.string().nullable(),
  messages: z.array(ChatMessageZ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ConversationFileZ = ConversationZ.extend({ version: z.literal(1) });

export const LegacyConversationsZ = z.object({ conversations: z.array(z.unknown()) });
