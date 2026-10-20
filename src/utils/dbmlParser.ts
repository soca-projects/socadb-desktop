import { DbmlSyntaxError, tokenizeDbml } from "./dbmlScan";
import type { DbmlToken } from "./dbmlScan";

export type DbmlOp = "<" | ">" | "-" | "<>";

export interface DbmlValue {
  kind: DbmlToken["kind"];
  value: string;
}

export interface DbmlEndpoint {
  schema: string | null;
  table: string | null;
  columns: string[];
}

export interface DbmlSettings {
  flags: Set<string>;
  values: Map<string, DbmlValue>;
  refs: { op: DbmlOp; target: DbmlEndpoint }[];
  checks: number;
}

export interface DbmlColumn {
  name: string;
  type: string;
  settings: DbmlSettings;
}

export type DbmlTableItem =
  | { kind: "column"; column: DbmlColumn }
  | { kind: "partial"; name: string };

export interface DbmlIndex {
  items: { kind: "column" | "expr"; value: string }[];
  settings: DbmlSettings;
}

export interface DbmlTable {
  schema: string | null;
  name: string;
  alias: string | null;
  settings: DbmlSettings;
  items: DbmlTableItem[];
  note: string | null;
  indexes: DbmlIndex[];
  checks: number;
}

export interface DbmlEnum {
  schema: string | null;
  name: string;
  values: string[];
}

export interface DbmlRef {
  from: DbmlEndpoint;
  op: DbmlOp;
  to: DbmlEndpoint;
  settings: DbmlSettings;
}

export interface DbmlFile {
  databaseType: string | null;
  tables: DbmlTable[];
  partials: DbmlTable[];
  enums: DbmlEnum[];
  refs: DbmlRef[];
  groups: string[];
  uses: string[];
  skipped: { name: string; line: number }[];
}

const SKIPPED_BLOCKS = new Set(["note", "records", "diagramview", "metadata", "dep"]);

const emptySettings = (): DbmlSettings => ({
  flags: new Set(),
  values: new Map(),
  refs: [],
  checks: 0,
});

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: DbmlToken[],
    private readonly source: string,
  ) {}

  private peek(offset = 0): DbmlToken | undefined {
    return this.tokens[this.pos + offset];
  }

  private next(): DbmlToken {
    const token = this.tokens[this.pos++];
    if (!token) throw new DbmlSyntaxError("unexpected end of file", this.lastLine());
    return token;
  }

  private lastLine(): number {
    return this.tokens[this.tokens.length - 1]?.line ?? 1;
  }

  private is(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return !!token && token.kind !== "string" && token.value.toLowerCase() === value;
  }

  private expect(value: string): DbmlToken {
    const token = this.next();
    if (token.value.toLowerCase() !== value)
      throw new DbmlSyntaxError(
        `expected "${value}", found "${token.value}"`,
        token.line,
      );
    return token;
  }

  private isName(token: DbmlToken | undefined): boolean {
    return !!token && (token.kind === "word" || token.kind === "quoted");
  }

  private name(): string {
    const token = this.next();
    if (!this.isName(token))
      throw new DbmlSyntaxError(`expected a name, found "${token.value}"`, token.line);
    return token.value;
  }

  private qualifiedName(): string[] {
    const parts = [this.name()];
    while (this.is(".") && this.isName(this.peek(1))) {
      this.next();
      parts.push(this.name());
    }
    return parts;
  }

  private text(): string {
    const token = this.next();
    if (token.kind !== "string" && token.kind !== "quoted")
      throw new DbmlSyntaxError(`expected a string, found "${token.value}"`, token.line);
    return token.value;
  }

  private note(): string {
    this.next();
    if (this.is(":")) {
      this.next();
      return this.text();
    }
    this.expect("{");
    const text = this.text();
    this.expect("}");
    return text;
  }

  private skipBlock() {
    this.expect("{");
    let depth = 1;
    while (depth > 0) {
      const token = this.next();
      if (token.kind !== "punct") continue;
      if (token.value === "{") depth++;
      else if (token.value === "}") depth--;
    }
  }

  private skipStatement() {
    const line = this.next().line;
    while (this.peek() && this.peek()?.line === line && !this.is("{")) this.next();
    if (this.is("{")) this.skipBlock();
  }

  file(): DbmlFile {
    const file: DbmlFile = {
      databaseType: null,
      tables: [],
      partials: [],
      enums: [],
      refs: [],
      groups: [],
      uses: [],
      skipped: [],
    };
    while (this.peek()) {
      if (this.is("project")) file.databaseType = this.project() ?? file.databaseType;
      else if (this.is("table")) file.tables.push(this.table());
      else if (this.is("tablepartial")) file.partials.push(this.table());
      else if (this.is("enum")) file.enums.push(this.enumBlock());
      else if (this.is("ref")) file.refs.push(...this.ref());
      else if (this.is("tablegroup")) {
        this.next();
        file.groups.push(this.qualifiedName().join("."));
        if (this.is("[")) this.settings();
        this.skipBlock();
      } else if (this.is("use") || this.is("reuse")) {
        const path = this.use();
        if (path !== null) file.uses.push(path);
      } else {
        const token = this.peek();
        if (token && !SKIPPED_BLOCKS.has(token.value.toLowerCase()))
          file.skipped.push({ name: token.value, line: token.line });
        this.skipStatement();
      }
    }
    return file;
  }

  private use(): string | null {
    this.next();
    if (this.is("{")) this.skipBlock();
    else this.next();
    if (!this.is("from")) return null;
    this.next();
    return this.text();
  }

  private project(): string | null {
    this.next();
    if (this.isName(this.peek())) this.next();
    this.expect("{");
    let databaseType: string | null = null;
    while (!this.is("}")) {
      if (this.is("note")) {
        this.note();
        continue;
      }
      const key = this.name().toLowerCase();
      this.expect(":");
      const value = this.next();
      if (key === "database_type") databaseType = value.value;
    }
    this.next();
    return databaseType;
  }

  private table(): DbmlTable {
    this.next();
    const parts = this.qualifiedName();
    let alias: string | null = null;
    if (this.is("as")) {
      this.next();
      alias = this.name();
    }
    const settings = this.is("[") ? this.settings() : emptySettings();
    const table: DbmlTable = {
      schema: parts.length > 1 ? parts[parts.length - 2] : null,
      name: parts[parts.length - 1],
      alias,
      settings,
      items: [],
      note: null,
      indexes: [],
      checks: 0,
    };
    this.expect("{");
    while (!this.is("}")) {
      if (this.is("note") && (this.is(":", 1) || this.is("{", 1)))
        table.note = this.note();
      else if (this.is("indexes") && this.is("{", 1))
        table.indexes.push(...this.indexes());
      else if (this.is("checks") && this.is("{", 1)) table.checks += this.checks();
      else if (this.is("records") && ["{", "(", "["].some((v) => this.is(v, 1)))
        this.skipStatement();
      else if (this.is("~")) {
        this.next();
        table.items.push({ kind: "partial", name: this.name() });
      } else table.items.push({ kind: "column", column: this.column() });
    }
    this.next();
    return table;
  }

  private arraySuffix(after: DbmlToken | undefined): boolean {
    if (!after || this.peek()?.start !== after.end) return false;
    return this.is("]", 1) || (this.peek(1)?.kind === "number" && this.is("]", 2));
  }

  private column(): DbmlColumn {
    const nameToken = this.peek();
    const name = this.name();
    const first = this.peek();
    let last: DbmlToken | undefined;
    while (this.peek()?.line === nameToken?.line && !this.is("}")) {
      if (this.is("[") && !this.arraySuffix(last)) break;
      last = this.next();
    }
    if (!first || !last)
      throw new DbmlSyntaxError(`column "${name}" has no type`, nameToken?.line ?? 1);
    const type = this.source.slice(first.start, last.end);
    return { name, type, settings: this.is("[") ? this.settings() : emptySettings() };
  }

  private settings(): DbmlSettings {
    this.expect("[");
    const settings = emptySettings();
    while (!this.is("]")) {
      if (this.is(",")) {
        this.next();
        continue;
      }
      const words: string[] = [];
      while (this.peek()?.kind === "word" && !this.is(":", 1))
        words.push(this.next().value);
      if (words.length) {
        settings.flags.add(words.join(" ").toLowerCase());
        continue;
      }
      const key = this.next().value.toLowerCase();
      this.expect(":");
      if (key === "ref")
        settings.refs.push({ op: this.op(), target: this.endpoint(true) });
      else if (key === "check") {
        this.value();
        settings.checks++;
      } else settings.values.set(key, this.value());
    }
    this.next();
    return settings;
  }

  private value(): DbmlValue {
    const tokens = [this.next()];
    while (this.peek()?.line === tokens[0].line && !this.is(",") && !this.is("]"))
      tokens.push(this.next());
    const [first] = tokens;
    if (tokens.length === 1) return { kind: first.kind, value: first.value };
    if (tokens.every((t) => t.kind === "word"))
      return { kind: "word", value: tokens.map((t) => t.value).join(" ") };
    const path = tokens.every((t, i) => (i % 2 ? t.value === "." : this.isName(t)));
    if (path && tokens.length % 2)
      return { kind: "word", value: tokens.map((t) => t.value).join("") };
    const last = tokens[tokens.length - 1];
    return { kind: "expr", value: this.source.slice(first.start, last.end) };
  }

  private op(): DbmlOp {
    if (this.is("?")) this.next();
    const token = this.next();
    if (this.is("?")) this.next();
    if (
      token.value === "<" ||
      token.value === ">" ||
      token.value === "-" ||
      token.value === "<>"
    )
      return token.value;
    throw new DbmlSyntaxError(
      `expected <, >, - or <>, found "${token.value}"`,
      token.line,
    );
  }

  private endpoint(inline = false): DbmlEndpoint {
    const parts = [this.name()];
    let columns: string[] | null = null;
    while (this.is(".")) {
      this.next();
      if (this.is("(")) {
        columns = this.nameList();
        break;
      }
      parts.push(this.name());
    }
    if (columns) {
      return {
        schema: parts.length > 1 ? parts[parts.length - 2] : null,
        table: parts[parts.length - 1],
        columns,
      };
    }
    if (parts.length < 2 && inline) return { schema: null, table: null, columns: parts };
    if (parts.length < 2)
      throw new DbmlSyntaxError(
        `"${parts[0]}" needs a table and a column`,
        this.peek()?.line ?? 1,
      );
    return {
      schema: parts.length > 2 ? parts[parts.length - 3] : null,
      table: parts[parts.length - 2],
      columns: [parts[parts.length - 1]],
    };
  }

  private nameList(): string[] {
    this.expect("(");
    const names: string[] = [];
    while (!this.is(")")) {
      if (this.is(",")) this.next();
      else names.push(this.name());
    }
    this.next();
    return names;
  }

  private ref(): DbmlRef[] {
    this.next();
    if (this.isName(this.peek()) && (this.is(":", 1) || this.is("{", 1))) this.next();
    const one = (): DbmlRef => {
      const from = this.endpoint();
      const op = this.op();
      const to = this.endpoint();
      return { from, op, to, settings: this.is("[") ? this.settings() : emptySettings() };
    };
    if (this.is(":")) {
      this.next();
      return [one()];
    }
    this.expect("{");
    const refs: DbmlRef[] = [];
    while (!this.is("}")) refs.push(one());
    this.next();
    return refs;
  }

  private enumBlock(): DbmlEnum {
    this.next();
    const parts = this.qualifiedName();
    this.expect("{");
    const values: string[] = [];
    while (!this.is("}")) {
      const token = this.next();
      if (token.kind === "punct") continue;
      values.push(token.value);
      if (this.is("[")) this.settings();
    }
    this.next();
    return {
      schema: parts.length > 1 ? parts[parts.length - 2] : null,
      name: parts[parts.length - 1],
      values,
    };
  }

  private indexes(): DbmlIndex[] {
    this.next();
    this.expect("{");
    const indexes: DbmlIndex[] = [];
    while (!this.is("}")) {
      const items: DbmlIndex["items"] = [];
      if (this.is("(")) {
        this.next();
        let item: DbmlToken[] = [];
        const flush = () => {
          if (item.length) items.push(this.indexItem(item));
          item = [];
        };
        let depth = 0;
        for (;;) {
          const token = this.next();
          const punct = token.kind === "punct" ? token.value : null;
          if (depth === 0 && punct === ")") break;
          if (depth === 0 && punct === ",") {
            flush();
            continue;
          }
          if (punct === "(") depth++;
          if (punct === ")") depth--;
          item.push(token);
        }
        flush();
      } else {
        items.push(this.indexItem([this.next()]));
      }
      indexes.push({ items, settings: this.is("[") ? this.settings() : emptySettings() });
    }
    this.next();
    return indexes;
  }

  private indexItem(tokens: DbmlToken[]): DbmlIndex["items"][number] {
    const [first] = tokens;
    if (tokens.length === 1 && this.isName(first))
      return { kind: "column", value: first.value };
    if (tokens.length === 1) return { kind: "expr", value: first.value };
    const last = tokens[tokens.length - 1];
    return { kind: "expr", value: this.source.slice(first.start, last.end) };
  }

  private checks(): number {
    this.next();
    this.expect("{");
    let count = 0;
    while (!this.is("}")) {
      if (this.next().kind === "expr") count++;
      if (this.is("[")) this.settings();
    }
    this.next();
    return count;
  }
}

export function parseDbml(source: string): DbmlFile {
  return new Parser(tokenizeDbml(source), source).file();
}
