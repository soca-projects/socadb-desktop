import { describe, it, expect, vi } from "vitest";

vi.mock("./menuActions", () => ({ commitActiveEdit: vi.fn() }));
vi.mock("./updater", () => ({ installOnClose: vi.fn(() => Promise.resolve()) }));

import { commitActiveEdit } from "./menuActions";
import { installOnClose } from "./updater";
import { handleCloseRequested } from "./windowClose";

describe("handleCloseRequested", () => {
  it("commits the field being edited before the close goes on", async () => {
    const order: string[] = [];
    vi.mocked(commitActiveEdit).mockImplementationOnce(() => order.push("commit"));
    vi.mocked(installOnClose).mockImplementationOnce(async () => {
      order.push("close");
    });
    await handleCloseRequested({ preventDefault: vi.fn() });
    expect(order).toEqual(["commit", "close"]);
  });
});
