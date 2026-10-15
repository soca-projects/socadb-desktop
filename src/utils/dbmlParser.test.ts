import { describe, it, expect } from "vitest";
import { parseDbml } from "./dbmlParser";
import type { DbmlColumn, DbmlTable } from "./dbmlParser";

const columns = (table: DbmlTable | undefined) =>
  (table?.items ?? []).flatMap((i) => (i.kind === "column" ? [i.column] : []));

const settingsOf = (column: DbmlColumn | undefined) => ({
  flags: [...(column?.settings.flags ?? [])],
  values: Object.fromEntries(column?.settings.values ?? []),
});

describe("parseDbml", () => {
  it("reads a table with its schema, alias, settings, note and columns", () => {
    const file = parseDbml(`
Table core.users as U [headercolor: #3498DB, note: 'From settings'] {
  id integer [primary key, increment]
  email "character varying"(120) [not null, unique, note: 'Login']
  price decimal(10, 2) [default: 0]
  tags text[]
  "full name" varchar
  Note: 'People who sign in'
}`);
    const [users] = file.tables;
    expect(users).toMatchObject({
      schema: "core",
      name: "users",
      alias: "U",
      note: "People who sign in",
    });
    expect(Object.fromEntries(users.settings.values)).toEqual({
      headercolor: { kind: "color", value: "#3498DB" },
      note: { kind: "string", value: "From settings" },
    });
    expect(columns(users).map((c) => [c.name, c.type])).toEqual([
      ["id", "integer"],
      ["email", '"character varying"(120)'],
      ["price", "decimal(10, 2)"],
      ["tags", "text[]"],
      ["full name", "varchar"],
    ]);
    expect(settingsOf(columns(users)[0]).flags).toEqual(["primary key", "increment"]);
    expect(settingsOf(columns(users)[1])).toEqual({
      flags: ["not null", "unique"],
      values: { note: { kind: "string", value: "Login" } },
    });
    expect(settingsOf(columns(users)[2]).values).toEqual({
      default: { kind: "number", value: "0" },
    });
  });

  it("reads a value that runs over several words", () => {
    const file = parseDbml(`
Ref: posts.user_id > users.id [delete: set null, update: no action, color: #aaa, inactive]`);
    expect(Object.fromEntries(file.refs[0].settings.values)).toEqual({
      delete: { kind: "word", value: "set null" },
      update: { kind: "word", value: "no action" },
      color: { kind: "color", value: "#aaa" },
    });
    expect([...file.refs[0].settings.flags]).toEqual(["inactive"]);
  });

  it("reads refs in every form", () => {
    const file = parseDbml(`
Table posts {
  user_id int [ref: > users.id, not null]
  editor_id int [ref: >? users.id]
}
Ref: comments.post_id > posts.id
Ref named: a.b < c.d
Ref { s1.t1.c1 - s2.t2.c2 [delete: cascade] }
Ref fk_period: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)
Ref: tags.id <> posts.id
Ref: x.a ?< y.b`);
    const [posts] = file.tables;
    expect(columns(posts)[0].settings.refs).toEqual([
      { op: ">", target: { schema: null, table: "users", columns: ["id"] } },
    ]);
    expect([...columns(posts)[0].settings.flags]).toEqual(["not null"]);
    expect(columns(posts)[1].settings.refs[0].op).toBe(">");
    expect(file.refs.map((r) => [r.from, r.op, r.to])).toEqual([
      [
        { schema: null, table: "comments", columns: ["post_id"] },
        ">",
        { schema: null, table: "posts", columns: ["id"] },
      ],
      [
        { schema: null, table: "a", columns: ["b"] },
        "<",
        { schema: null, table: "c", columns: ["d"] },
      ],
      [
        { schema: "s1", table: "t1", columns: ["c1"] },
        "-",
        { schema: "s2", table: "t2", columns: ["c2"] },
      ],
      [
        {
          schema: null,
          table: "merchant_periods",
          columns: ["merchant_id", "country_code"],
        },
        ">",
        { schema: null, table: "merchants", columns: ["id", "country_code"] },
      ],
      [
        { schema: null, table: "tags", columns: ["id"] },
        "<>",
        { schema: null, table: "posts", columns: ["id"] },
      ],
      [
        { schema: null, table: "x", columns: ["a"] },
        "<",
        { schema: null, table: "y", columns: ["b"] },
      ],
    ]);
    expect(file.refs[2].settings.values.get("delete")?.value).toBe("cascade");
  });

  it("reads enums, with quoted values, notes and commas", () => {
    const file = parseDbml(`
enum v2.job_status {
  created [note: 'Waiting']
  running
  "Not Yet Set"
}
Enum grade { A, B, C }`);
    expect(file.enums).toEqual([
      { schema: "v2", name: "job_status", values: ["created", "running", "Not Yet Set"] },
      { schema: null, name: "grade", values: ["A", "B", "C"] },
    ]);
  });

  it("reads indexes, expressions and nested parentheses included", () => {
    const file = parseDbml(`
Table bookings {
  id int
  country varchar
  name varchar
  indexes {
    (id, country) [pk]
    created_at [name: 'created_at_index', note: 'Date']
    (country, booking_date) [unique]
    booking_date [type: hash]
    (\`id*2\`)
    (country, (lower(name)))
  }
}`);
    expect(
      file.tables[0].indexes.map((i) => [
        i.items,
        [...i.settings.flags],
        i.settings.values.get("name")?.value,
      ]),
    ).toEqual([
      [
        [
          { kind: "column", value: "id" },
          { kind: "column", value: "country" },
        ],
        ["pk"],
        undefined,
      ],
      [[{ kind: "column", value: "created_at" }], [], "created_at_index"],
      [
        [
          { kind: "column", value: "country" },
          { kind: "column", value: "booking_date" },
        ],
        ["unique"],
        undefined,
      ],
      [[{ kind: "column", value: "booking_date" }], [], undefined],
      [[{ kind: "expr", value: "id*2" }], [], undefined],
      [
        [
          { kind: "column", value: "country" },
          { kind: "expr", value: "(lower(name))" },
        ],
        [],
        undefined,
      ],
    ]);
  });

  it("reads partials and where they are injected", () => {
    const file = parseDbml(`
TablePartial timestamps [headercolor: #ff0000] {
  created_at timestamp [default: \`now()\`]
}
Table users {
  id int [pk]
  ~timestamps
  name varchar
}`);
    expect(file.partials.map((p) => p.name)).toEqual(["timestamps"]);
    expect(
      file.tables[0].items.map((i) =>
        i.kind === "column" ? i.column.name : `~${i.name}`,
      ),
    ).toEqual(["id", "~timestamps", "name"]);
  });

  it("reads the database type and the names of groups and other files", () => {
    const file = parseDbml(`
use * from './base'
use {
  table auth.users as u
} from './auth.dbml'
Project shop {
  database_type: 'PostgreSQL'
  Note: '''
    The shop
  '''
}
TableGroup "Sales" [color: #345, note: 'Orders'] {
  orders
  Note: 'All about orders'
}`);
    expect(file.databaseType).toBe("PostgreSQL");
    expect(file.groups).toEqual(["Sales"]);
    expect(file.uses).toEqual(["./base", "./auth.dbml"]);
  });

  it("skips what SocaDB doesn't read and counts the checks", () => {
    const file = parseDbml(`
Note sticky [color: #fff] {
  'Anything { goes } here'
}
records users(id, name) {
  1, 'Alice'
  2, 'Bob'
}
DiagramView main {
  Tables { * }
}
Metadata Table users { owner: 'data-team' }
Table users [owner: "data-team"] {
  id int
  age int [check: \`age > 0\`, check: \`age < 150\`]
  checks {
    \`id > 0\` [name: 'positive_id']
    \`age <> 3\`
  }
  records (id, age) [example] {
    1, 20
  }
}
Table "after" { id int }`);
    expect(file.tables.map((t) => t.name)).toEqual(["users", "after"]);
    expect(file.tables[0].checks).toBe(2);
    expect(columns(file.tables[0])[1].settings.checks).toBe(2);
    expect(columns(file.tables[0]).map((c) => c.name)).toEqual(["id", "age"]);
  });

  it("keeps a column named after a keyword", () => {
    const file = parseDbml(`
Table t {
  note text
  indexes int
  records varchar
  checks int
}`);
    expect(columns(file.tables[0]).map((c) => [c.name, c.type])).toEqual([
      ["note", "text"],
      ["indexes", "int"],
      ["records", "varchar"],
      ["checks", "int"],
    ]);
  });

  it("says on which line the file stops making sense", () => {
    expect(() => parseDbml("Table t {\n  id int\n  name\n}")).toThrow("DBML line 3");
    expect(() => parseDbml("Table t {\n  id int")).toThrow("unexpected end of file");
    expect(() => parseDbml("Ref: a.b >> c.d")).toThrow("DBML line 1");
    expect(() => parseDbml("Ref: a > c.d")).toThrow("needs a table and a column");
    expect(() =>
      parseDbml("Table t {\n  a int [default: `x`\n  b int [pk]\n  c int\n}"),
    ).toThrow("DBML line 3");
  });
});
