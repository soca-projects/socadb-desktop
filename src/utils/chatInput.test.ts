import { describe, expect, it } from "vitest";
import { messageToSend } from "./chatInput";

describe("messageToSend", () => {
  it("returns the trimmed text when the chat can take a message", () => {
    expect(messageToSend("  hello \n", { disabled: false, isStreaming: false })).toBe(
      "hello",
    );
  });

  it("ignores an empty message", () => {
    expect(messageToSend("  \n", { disabled: false, isStreaming: false })).toBeNull();
  });

  it("keeps the text out of the send while a reply is running", () => {
    expect(messageToSend("hello", { disabled: false, isStreaming: true })).toBeNull();
  });

  it("keeps the text out of the send when the input is disabled", () => {
    expect(messageToSend("hello", { disabled: true, isStreaming: false })).toBeNull();
  });

  it("treats a missing streaming state as not streaming", () => {
    expect(messageToSend("hello", { disabled: false })).toBe("hello");
  });
});
