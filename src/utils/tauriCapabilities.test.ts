import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function permissions(): unknown {
  const file = join(ROOT, "src-tauri/capabilities/default.json");
  return JSON.parse(readFileSync(file, "utf-8")).permissions;
}

describe("default capability", () => {
  it("allows destroy, which onCloseRequested calls to close the window on Windows and Linux", () => {
    expect(permissions()).toContain("core:window:allow-destroy");
  });
});
