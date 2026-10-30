import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./agentPrompt";
import { createEmptySchema } from "../stores/schemaStore";
import type { Schema } from "../types/schema";

function library(dbType: "mysql" | "postgresql"): Schema {
  const col = (id: string, name: string) => ({
    id,
    name,
    type: "int" as const,
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
  });
  return {
    ...createEmptySchema("library", dbType),
    tables: [
      { id: "t1", name: "members", position: { x: 0, y: 0 }, columns: [col("m", "id")] },
      {
        id: "t2",
        name: "loans",
        position: { x: 0, y: 0 },
        columns: [col("l", "member_id")],
      },
    ],
    relations: [
      {
        id: "r",
        from: { tableId: "t2", columnId: "l" },
        to: { tableId: "t1", columnId: "m" },
        type: "N:1",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
    ],
  };
}

describe("buildSystemPrompt", () => {
  it("describes the schema and its relations", () => {
    const prompt = buildSystemPrompt(library("postgresql"));
    expect(prompt).toContain('Schema: "library"');
    expect(prompt).toContain("- members (1 cols: id)");
    expect(prompt).toContain("- loans.member_id → members.id (N:1)");
  });

  it("gives the agent the user's primary key for new tables", () => {
    expect(buildSystemPrompt(library("postgresql"), "bigint")).toContain(
      "New tables start with the user's primary key: id BIGSERIAL NOT NULL",
    );
    expect(buildSystemPrompt(library("mysql"))).toContain(
      "New tables start with the user's primary key: id INT NOT NULL AUTO_INCREMENT",
    );
  });

  it("lists the types of the schema's database and its enum rules", () => {
    const pg = buildSystemPrompt(library("postgresql"));
    expect(pg).toContain("Column types must exist in PostgreSQL:");
    expect(pg).toContain("timestamptz");
    expect(pg).toContain("enumName");
    expect(pg).toContain("foreign key columns, which PostgreSQL doesn't index");

    const my = buildSystemPrompt(library("mysql"));
    expect(my).toContain("Column types must exist in MySQL:");
    expect(my).not.toContain("timestamptz");
    expect(my).not.toContain("enumName");
    expect(my).toContain("decimal(10,2)");
  });
});
