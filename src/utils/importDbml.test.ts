import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import i18next from "../i18n";
import { parseDbmlSchema } from "./importDbml";
import type { SqlImportResult } from "./importSql";
import { indexColumnNames } from "./indexHelpers";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    "utf-8",
  );

const tableOf = (result: SqlImportResult, name: string) =>
  result.tables.find((t) => t.name === name);

function columnOf(result: SqlImportResult, path: string) {
  const [table, column] = path.split(".");
  return tableOf(result, table)?.columns.find((c) => c.name === column);
}

function relationsOf(result: SqlImportResult): string[] {
  const name = (tableId: string, columnId: string) => {
    const table = result.tables.find((t) => t.id === tableId);
    return `${table?.name}.${table?.columns.find((c) => c.id === columnId)?.name}`;
  };
  return result.relations.map(
    (r) =>
      `${name(r.from.tableId, r.from.columnId)} > ${name(r.to.tableId, r.to.columnId)} ${r.type} ${r.onDelete}/${r.onUpdate}`,
  );
}

const enumOf = (result: SqlImportResult, path: string) =>
  result.enums.find((e) => e.id === columnOf(result, path)?.enumId);

beforeAll(async () => {
  await i18next.changeLanguage("en");
});

describe("parseDbmlSchema", () => {
  const shop = parseDbmlSchema(fixture("shop.dbml"), "mysql");

  it("reads the database the file names over the current one", () => {
    expect(shop.detectedDbType).toBe("postgresql");
    expect(shop.attempted).toBe(shop.tables.length);
  });

  it("imports tables with their columns, partials included", () => {
    expect(shop.tables.map((t) => t.name)).toEqual([
      "users",
      "products",
      "orders",
      "order_items",
      "profiles",
      "categories",
      "products_categories",
    ]);
    expect(tableOf(shop, "users")?.columns.map((c) => c.name)).toEqual([
      "id",
      "email",
      "full_name",
      "created_at",
      "updated_at",
    ]);
    expect(tableOf(shop, "users")).toMatchObject({
      note: "People who buy",
      color: "#3498DB",
    });
    expect(columnOf(shop, "users.id")).toMatchObject({
      type: "serial",
      isPrimaryKey: true,
      isUnique: true,
      isNullable: false,
      isAutoIncrement: true,
    });
    expect(columnOf(shop, "users.email")).toMatchObject({
      type: "varchar",
      length: 255,
      isNullable: false,
      isUnique: true,
      note: "Login",
    });
    expect(columnOf(shop, "users.full_name")?.type).toBe("text");
    expect(columnOf(shop, "orders.created_at")).toMatchObject({
      type: "timestamp",
      isNullable: false,
      defaultValue: "now()",
      defaultKind: "expression",
    });
  });

  it("maps types and defaults to the database", () => {
    expect(columnOf(shop, "products.price")).toMatchObject({
      type: "numeric",
      precision: 10,
      scale: 2,
      defaultValue: "0",
      defaultKind: "value",
    });
    expect(columnOf(shop, "products.in_stock")).toMatchObject({
      type: "boolean",
      defaultValue: "true",
      defaultKind: "value",
    });
    expect(columnOf(shop, "order_items.quantity")?.type).toBe("integer");
    expect(columnOf(shop, "products.tags")?.type).toBe("varchar");
  });

  it("links enum columns to their enum", () => {
    expect(enumOf(shop, "orders.status")).toMatchObject({
      name: "order_status",
      values: ["pending", "paid", "shipped", "on hold"],
    });
    expect(columnOf(shop, "orders.status")).toMatchObject({
      type: "enum",
      defaultValue: "pending",
      defaultKind: "value",
    });
  });

  it("reads composite keys and indexes", () => {
    const items = tableOf(shop, "order_items");
    expect(items?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)).toEqual([
      "order_id",
      "product_id",
    ]);
    expect(columnOf(shop, "order_items.order_id")?.isUnique).toBe(false);
    const products = tableOf(shop, "products");
    expect(products?.indexes?.map((i) => indexColumnNames(products, i))).toEqual([
      ["name"],
    ]);
  });

  it("turns refs into relations in the right direction", () => {
    expect(relationsOf(shop)).toEqual([
      "orders.user_id > users.id N:1 NO ACTION/NO ACTION",
      "order_items.order_id > orders.id N:1 CASCADE/NO ACTION",
      "order_items.product_id > products.id N:1 RESTRICT/CASCADE",
      "profiles.user_id > users.id 1:1 NO ACTION/NO ACTION",
      "products_categories.products_id > products.id N:1 NO ACTION/NO ACTION",
      "products_categories.categories_id > categories.id N:1 NO ACTION/NO ACTION",
    ]);
    expect(columnOf(shop, "orders.user_id")?.isForeignKey).toBe(true);
    expect(columnOf(shop, "users.id")?.isForeignKey).toBe(false);
  });

  it("creates the join table of a many-to-many", () => {
    expect(tableOf(shop, "products_categories")?.columns).toEqual([
      expect.objectContaining({
        name: "products_id",
        type: "integer",
        isPrimaryKey: true,
        isForeignKey: true,
        isNullable: false,
        isUnique: false,
        isAutoIncrement: false,
      }),
      expect.objectContaining({ name: "categories_id", type: "integer" }),
    ]);
  });

  it("says what it left out or added", () => {
    expect(shop.issues).toEqual([
      { kind: "typeGuessed", table: "products", column: "tags", type: "text[]" },
      {
        kind: "indexSkipped",
        table: "products",
        name: "products_lower_name",
        reason: "expression",
      },
      {
        kind: "joinTable",
        table: "products_categories",
        from: "products",
        to: "categories",
      },
      { kind: "groupSkipped", name: "sales" },
    ]);
  });
});

describe("parseDbmlSchema dialects", () => {
  it("reads a file without a database as the current schema's", () => {
    const pg = parseDbmlSchema(
      "Table t { id int\n at datetime\n n mediumint }",
      "postgresql",
    );
    expect(pg.detectedDbType).toBeNull();
    expect(pg.tables[0].columns.map((c) => c.type)).toEqual([
      "integer",
      "timestamp",
      "integer",
    ]);
    const mysql = parseDbmlSchema("Table t { id integer\n at timestamptz }", "mysql");
    expect(mysql.tables[0].columns.map((c) => c.type)).toEqual(["int", "timestamp"]);
  });

  it("reads MySQL's increment, unsigned and inline enums", () => {
    const result = parseDbmlSchema(`
Project p { database_type: 'MySQL' }
Table t {
  id "bigint unsigned" [pk, increment]
  flag tinyint(1) [default: false]
  size enum('s', 'm', 'l') [default: 'm']
  code serial
}`);
    expect(result.detectedDbType).toBe("mysql");
    expect(columnOf(result, "t.id")).toMatchObject({
      type: "bigint",
      unsigned: true,
      isAutoIncrement: true,
    });
    expect(columnOf(result, "t.flag")).toMatchObject({
      type: "boolean",
      defaultValue: "false",
    });
    expect(enumOf(result, "t.size")).toMatchObject({
      name: "t_size",
      values: ["s", "m", "l"],
    });
    expect(columnOf(result, "t.code")).toMatchObject({
      type: "bigint",
      unsigned: true,
      isAutoIncrement: true,
      isUnique: true,
    });
    expect(result.issues).toEqual([]);
  });

  it("knows other database names", () => {
    const of = (name: string) =>
      parseDbmlSchema(`Project p { database_type: '${name}' }\nTable t { id int }`)
        .detectedDbType;
    expect(of("postgres")).toBe("postgresql");
    expect(of("MariaDB")).toBe("mysql");
    expect(of("SQL Server")).toBeNull();
  });
});

describe("parseDbmlSchema details", () => {
  it("reads every kind of default", () => {
    const result = parseDbmlSchema(
      `Table t {
  a varchar [default: 'it\\'s']
  b int [default: -1]
  c varchar [default: null]
  d timestamp [default: \`CURRENT_TIMESTAMP\`]
  e varchar [default: "quoted"]
  f int [default: \`nextval('t_f_seq')\`]
}`,
      "postgresql",
    );
    const defaults = result.tables[0].columns.map((c) => [
      c.name,
      c.defaultValue,
      c.defaultKind,
    ]);
    expect(defaults).toEqual([
      ["a", "it's", "value"],
      ["b", "-1", "value"],
      ["c", null, undefined],
      ["d", "CURRENT_TIMESTAMP", "expression"],
      ["e", "quoted", "value"],
      ["f", null, undefined],
    ]);
    expect(columnOf(result, "t.f")).toMatchObject({
      type: "serial",
      isAutoIncrement: true,
    });
  });

  it("lets a table's own columns win over its partials, and a later partial over an earlier one", () => {
    const result = parseDbmlSchema(
      `TablePartial a [headercolor: #f00] {
  id int
  note text
  Note: 'From a'
}
TablePartial b {
  note varchar(10)
  indexes { note [unique] }
}
Table t {
  ~a
  ~b
  ~missing
  id bigint [pk]
}`,
      "postgresql",
    );
    expect(result.tables[0].columns.map((c) => [c.name, c.type, c.length])).toEqual([
      ["id", "bigint", undefined],
      ["note", "varchar", 10],
    ]);
    expect(columnOf(result, "t.note")?.isUnique).toBe(true);
    expect(result.tables[0]).toMatchObject({ note: "From a", color: "#FF0000" });
  });

  it("keeps a table's own note and color over its partials'", () => {
    const result =
      parseDbmlSchema(`TablePartial a [headercolor: #f00, note: 'A'] { x int }
Table t [headercolor: #00ff00, note: 'Own'] { ~a }`);
    expect(result.tables[0]).toMatchObject({ note: "Own", color: "#00FF00" });
  });

  it("puts the key of a one-to-one on the column that carries the inline ref", () => {
    const result = parseDbmlSchema(`Table users { id int [pk] }
Table profiles { user_id int [ref: - users.id] }`);
    expect(relationsOf(result)).toEqual([
      "profiles.user_id > users.id 1:1 NO ACTION/NO ACTION",
    ]);
  });

  it("makes one relation of a ref written twice", () => {
    const result = parseDbmlSchema(`Table users { id int [pk] }
Table posts { user_id int [ref: > users.id] }
Ref: posts.user_id > users.id
Ref: users.id < posts.user_id`);
    expect(result.relations).toHaveLength(1);
  });

  it("links composite refs column by column", () => {
    const result = parseDbmlSchema(`Table merchants {
  id int
  country_code varchar
  indexes { (id, country_code) [pk] }
}
Table merchant_periods { merchant_id int
  country_code varchar }
Ref: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)`);
    expect(relationsOf(result)).toEqual([
      "merchant_periods.merchant_id > merchants.id N:1 NO ACTION/NO ACTION",
      "merchant_periods.country_code > merchants.country_code N:1 NO ACTION/NO ACTION",
    ]);
  });

  it("names a self many-to-many's columns apart", () => {
    const result = parseDbmlSchema(`Table users { id int [pk] }
Table users_users { id int }
Ref: users.id <> users.id`);
    expect(tableOf(result, "users_users_2")?.columns.map((c) => c.name)).toEqual([
      "users_id",
      "users_id_2",
    ]);
    expect(result.relations).toHaveLength(2);
  });

  it("keeps twin tables from two schemas apart", () => {
    const result = parseDbmlSchema(`Table auth.users { id int [pk] }
Table users { id int [pk] }
Table posts {
  author_id int [ref: > auth.users.id]
  reader_id int [ref: > users.id]
  checked int [check: \`checked > 0\`]
}
Table auth.sessions {
  user_id int [ref: > auth.users.id]
  checks { \`user_id > 0\` }
}`);
    expect(result.tables.map((t) => t.name)).toEqual([
      "auth_users",
      "users",
      "posts",
      "sessions",
    ]);
    expect(relationsOf(result)).toEqual([
      "posts.author_id > auth_users.id N:1 NO ACTION/NO ACTION",
      "posts.reader_id > users.id N:1 NO ACTION/NO ACTION",
      "sessions.user_id > auth_users.id N:1 NO ACTION/NO ACTION",
    ]);
    expect(result.issues).toEqual([
      { kind: "checkSkipped", table: "posts" },
      { kind: "checkSkipped", table: "sessions" },
    ]);
  });

  it("finds enums by quoted or schema-qualified name", () => {
    const result = parseDbmlSchema(
      `Enum "order status" { new done }
Enum v2.job_status { queued }
Table t {
  a "order status"
  b v2.job_status
  c "double precision"
}`,
      "postgresql",
    );
    expect(enumOf(result, "t.a")?.name).toBe("order status");
    expect(enumOf(result, "t.b")?.name).toBe("job_status");
    expect(columnOf(result, "t.c")?.type).toBe("double precision");
  });

  it("keeps a named index and drops the name SocaDB would derive anyway", () => {
    const result = parseDbmlSchema(
      `Table t {
  a int
  b int
  indexes {
    (a, b) [name: 'ab_lookup']
    (b, a) [unique, name: 't_b_a_key']
  }
}`,
      "postgresql",
    );
    expect(result.tables[0].indexes?.map((i) => [i.name, i.unique])).toEqual([
      ["ab_lookup", false],
      [undefined, true],
    ]);
  });

  it("tells apart tables whose names differ only in case", () => {
    const result = parseDbmlSchema(`Table countries { code varchar [pk] }
Table Countries { Id int [pk] }
Table users { country_code varchar }
Table States { CountryId int }
Ref: Countries.Id < States.CountryId
Ref: countries.code < users.country_code`);
    expect(relationsOf(result)).toEqual([
      "States.CountryId > Countries_2.Id N:1 NO ACTION/NO ACTION",
      "users.country_code > countries.code N:1 NO ACTION/NO ACTION",
    ]);
  });

  it("reads old forms: quoted notes, refs to the same table, enum defaults by path", () => {
    const result = parseDbmlSchema(`Table users {
  id integer [pk]
  status v2.status [default: v2.status.new]
  role v2.status [default: churn]
  referrer integer [ref: > id]
  note: "Everyone"
}
enum v2.status { churn
  new }`);
    expect(tableOf(result, "users")?.note).toBe("Everyone");
    expect(columnOf(result, "users.status")).toMatchObject({
      defaultValue: "new",
      defaultKind: "value",
    });
    expect(columnOf(result, "users.role")?.defaultValue).toBe("churn");
    expect(relationsOf(result)).toEqual([
      "users.referrer > users.id N:1 NO ACTION/NO ACTION",
    ]);
  });

  it("finds an enum written as a quoted, schema-qualified name", () => {
    const result = parseDbmlSchema(
      `Enum "v2"."job_status" { queued done }
Table jobs { status "v2"."job_status" [default: 'queued'] }`,
      "postgresql",
    );
    expect(enumOf(result, "jobs.status")?.name).toBe("job_status");
    expect(result.issues).toEqual([]);
  });

  it("says which top-level line it didn't know", () => {
    const result = parseDbmlSchema(`Tabel users { id int }
Note sticky { 'Hello' }
Dep: raw_users.id -> users.id [note: 'Cast']
Table posts { id int }`);
    expect(result.tables.map((t) => t.name)).toEqual(["posts"]);
    expect(result.issues).toEqual([{ kind: "blockSkipped", name: "Tabel", line: 1 }]);
  });

  it("says when the file uses tables from other files", () => {
    const result = parseDbmlSchema(`use * from './base'
Table posts { user_id int [ref: > users.id] }`);
    expect(result.relations).toEqual([]);
    expect(result.issues).toEqual([{ kind: "useSkipped", path: "./base" }]);
  });

  it("reports a syntax error with its line and nothing from the file", async () => {
    await i18next.changeLanguage("fr");
    expect(() => parseDbmlSchema("Table secret_name {\n  id int\n  name\n}")).toThrow(
      "Impossible de lire ce fichier DBML : la ligne 3 n'est pas du DBML valide.",
    );
    await i18next.changeLanguage("en");
  });
});
