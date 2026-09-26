import { describe, it, expect, beforeAll } from "vitest";
import i18next from "../i18n";
import { makeProvider } from "../types/chat";
import { isAuthErrorMessage } from "../../mcp-server/src/agent-runner-shared";
import { authErrorText, chatSendErrorText } from "./chatErrors";

beforeAll(async () => {
  await i18next.changeLanguage("en");
});

describe("isAuthErrorMessage", () => {
  // Messages captured from the bundled CLIs with no login and with a bad key.
  it.each([
    "Claude Code returned an error result: Not logged in · Please run /login",
    'Claude Code returned an error result: Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}',
    "Codex Exec exited with code 1: Reading prompt from stdin...\nERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://api.openai.com/v1/responses",
  ])("flags %s", (message) => {
    expect(isAuthErrorMessage(message)).toBe(true);
  });

  it.each([
    "Your credit balance is too low to access the Anthropic API.",
    "Agent process exited with code 1",
    "Invalid command",
  ])("leaves %s alone", (message) => {
    expect(isAuthErrorMessage(message)).toBe(false);
  });
});

describe("authErrorText", () => {
  it("points subscription users to the CLI login command", () => {
    const text = authErrorText("claude", makeProvider("claude", "subscription"));
    expect(text).toContain("Claude Code");
    expect(text).toContain("`claude /login`");
  });

  it("uses the Codex login command for Codex", () => {
    expect(authErrorText("codex", makeProvider("codex", "subscription"))).toContain(
      "`codex login`",
    );
  });

  it("tells API key users their saved key was rejected", () => {
    const text = authErrorText("claude", makeProvider("claude", "api-key", true));
    expect(text).toContain("rejected");
    expect(text).toContain("Anthropic");
  });

  it("tells API key users when no key is saved", () => {
    expect(authErrorText("codex", makeProvider("codex", "api-key", false))).toContain(
      "No OpenAI API key",
    );
  });

  it("falls back to subscription steps when the provider is unknown", () => {
    expect(authErrorText("claude", undefined)).toContain("`claude /login`");
  });
});

describe("chatSendErrorText", () => {
  it("translates the codes chat_send refuses with", () => {
    expect(chatSendErrorText("claude", "api_key_missing")).toContain(
      "No Anthropic API key",
    );
    expect(chatSendErrorText("codex", "keyring_unavailable")).toContain("keychain");
  });

  it("passes other errors through", () => {
    expect(chatSendErrorText("claude", new Error("Agent runner not found"))).toBe(
      "Agent runner not found",
    );
  });
});
