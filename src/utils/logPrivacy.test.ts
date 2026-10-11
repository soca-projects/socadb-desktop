import { describe, it, expect } from "vitest";
import { maskQuoted, pathForLog } from "./logPrivacy";

describe("pathForLog", () => {
  it("keeps where a file is, never its name or folders", () => {
    expect(pathForLog("/Users/ana/Documents/Clients/Acme/payroll.soca")).toMatchObject({
      where: "~/Documents",
      ext: "soca",
    });
    expect(
      pathForLog("/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/a.soca").where,
    ).toBe("iCloud Drive");
    expect(pathForLog("C:\\Users\\Ana\\OneDrive - Acme Corp\\x.soca").where).toBe(
      "OneDrive",
    );
    expect(pathForLog("c:\\users\\ana\\Desktop\\x.soca").where).toBe("~/Desktop");
    expect(pathForLog("/home/ana/code/shop/schema.soca").where).toBe("~");
    expect(pathForLog("/Volumes/Ana's SSD/x.soca").where).toBe("external volume");
    expect(pathForLog("\\\\fs01\\home$\\ana\\x.soca").where).toBe("network share");
    expect(pathForLog("D:\\Clients\\x.soca").where).toBe("outside home");
    expect(
      JSON.stringify(pathForLog("/Users/ana/Documents/Clients/Acme/payroll.soca")),
    ).not.toMatch(/ana|Acme|payroll|Clients/);
  });

  it("gives the same id to the same path only", () => {
    const a = pathForLog("/Users/ana/Documents/a.soca").id;
    expect(pathForLog("/Users/ana/Documents/a.soca").id).toBe(a);
    expect(pathForLog("/Users/ana/Documents/b.soca").id).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("maskQuoted", () => {
  it("hides quoted names in error messages", () => {
    expect(maskQuoted('Table "patients_hiv" already exists')).toBe(
      'Table "…" already exists',
    );
  });
});
