# DB Type Selection & SQL Export

## Context

SocaDB has 18 generic column types with no notion of database engine. Export is PNG only. Users need SQL DDL export (MySQL + PostgreSQL) and the column types should match their target database.

## Design

### Approach: Types distincts par moteur

Each DB engine has its own list of column types. The user chooses the engine at schema creation. Export DDL maps directly from the stored types — no lossy conversion.

### 1. Types & Store

New `DbType` field in Schema:

```typescript
export type DbType = "mysql" | "postgresql";

export interface Schema {
  version: string;
  name: string;
  dbType: DbType;
  createdAt: string;
  updatedAt: string;
  tables: Table[];
  relations: Relation[];
}
```

`ColumnType` becomes a string union of all possible types across engines. Two constant arrays define the available types per engine:

**MySQL types:**
`int`, `bigint`, `tinyint`, `smallint`, `mediumint`, `float`, `double`, `decimal`, `varchar`, `char`, `text`, `mediumtext`, `longtext`, `boolean`, `date`, `time`, `datetime`, `timestamp`, `json`, `enum`, `blob`

**PostgreSQL types:**
`integer`, `bigint`, `smallint`, `real`, `double precision`, `numeric`, `varchar`, `char`, `text`, `boolean`, `date`, `time`, `timestamp`, `timestamptz`, `uuid`, `serial`, `bigserial`, `json`, `jsonb`, `bytea`

Default column per engine:
- MySQL: `id INT AUTO_INCREMENT, PK`
- PostgreSQL: `id UUID, PK, default gen_random_uuid()`

### 2. New Schema Modal

**When:** first launch (empty schema) + Cmd+N

**Component:** `NewSchemaModal/NewSchemaModal.tsx`

**Content:**
- Text input "Schema name" (default: "Untitled")
- Two clickable cards: MySQL / PostgreSQL
- "Create" button

**Behavior:**
- First launch: modal blocks interaction (no backdrop dismiss)
- Cmd+N: backdrop click cancels
- On create: `setSchema(createEmptySchema(name, dbType))`

### 3. SQL DDL Export

**File:** `utils/exportSql.ts`

Two generator functions:
- `generateMysqlDdl(schema): string`
- `generatePostgresqlDdl(schema): string`

Each generates full DDL: `CREATE TABLE` with types, PK, constraints, `FOREIGN KEY` with `ON DELETE`/`ON UPDATE`, in the correct dialect.

Export flow: Toolbar dropdown → "Export SQL" → generates DDL based on `schema.dbType` → Tauri save dialog (`.sql` filter) → write file.

### 4. SVG Export (bonus)

Same pattern as PNG using `html-to-image`'s `toSvg()`. Added as an item in the Toolbar export dropdown.

### 5. Toolbar Export Dropdown

The single export button becomes a dropdown with:
- Export PNG (existing)
- Export SVG (new)
- Export SQL (new)

## Decisions

- DB type chosen at schema creation, cannot be changed after
- No generic/agnostic types — each engine has its own type list
- Single DDL export (matches schema's `dbType`), no cross-engine export
- SVG export is trivial (html-to-image supports it)
- Welcome screen / recent files deferred to Phase 4
