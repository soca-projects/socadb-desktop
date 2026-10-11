import { describe, it, expect } from "vitest";
import { maskPaths, maskQuoted, pathForLog } from "./logPrivacy";

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

describe("maskPaths", () => {
  it("removes paths from file API errors, spaces included", () => {
    expect(
      maskPaths(
        "failed to open file at path: /Users/ana/Clients/Acme Corp/Q3 billing.soca with error: Permission denied (os error 13)",
      ),
    ).toBe(
      "failed to open file at path: <path> with error: Permission denied (os error 13)",
    );
    expect(
      maskPaths(
        "forbidden path: /Volumes/ClientX/a.soca, maybe it is not allowed on the scope",
      ),
    ).toBe("forbidden path: <path>, maybe it is not allowed on the scope");
    expect(maskPaths("failed to get metadata of path: /Users/ana/Acme Corp/x.soca")).toBe(
      "failed to get metadata of path: <path>",
    );
  });

  it("removes unlabelled paths to the end of the message", () => {
    expect(maskPaths("Not allowed to open /Users/ana/Patients HIV/x.soca")).toBe(
      "Not allowed to open <path>",
    );
    expect(
      maskPaths("cannot read C:\\Users\\Ana Lopez\\Documents\\Acme Corp\\x.soca"),
    ).toBe("cannot read <path>");
    expect(maskPaths("see \\\\fs01\\share\\Acme Corp\\x.soca")).toBe("see <path>");
    expect(maskPaths("open file:///Users/ana/Acme/x.soca failed")).toBe(
      "open <path> failed",
    );
    expect(maskPaths('reveal "/home/ana/x.soca" failed')).toBe('reveal "<path>" failed');
  });

  it("leaves URLs and plain text alone", () => {
    expect(maskPaths("fetch http://localhost:1420/src/App.tsx failed")).toBe(
      "fetch http://localhost:1420/src/App.tsx failed",
    );
    expect(maskPaths("Table not found")).toBe("Table not found");
  });
});

describe("maskQuoted", () => {
  it("hides quoted names in error messages", () => {
    expect(maskQuoted('Table "patients_hiv" already exists')).toBe(
      'Table "…" already exists',
    );
  });

  it("isn't fooled by escaped quotes, and masks single quotes but not apostrophes", () => {
    expect(
      maskQuoted(
        '{"message":"model output: I created \\"patients_hiv\\" and \\"billing\\" tables"}',
      ),
    ).toBe('{"…":"…"}');
    expect(maskQuoted("can't find table 'patients_hiv'")).toBe("can't find table '…'");
  });
});
