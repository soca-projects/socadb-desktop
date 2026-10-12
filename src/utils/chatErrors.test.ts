import { describe, it, expect, beforeAll } from "vitest";
import i18next from "../i18n";
import { makeProvider } from "../types/chat";
import {
  codexErrorCode,
  codexErrorText,
  isAuthErrorMessage,
  isReconnectNotice,
} from "../../mcp-server/src/agent-runner-shared";
import { authErrorText, chatSendErrorText } from "./chatErrors";

beforeAll(async () => {
  await i18next.changeLanguage("en");
});

describe("isAuthErrorMessage", () => {
  // Messages captured from the bundled CLIs with no login and with a bad key.
  it.each([
    "Claude Code returned an error result: Not logged in · Please run /login",
    "Claude Code returned an error result: Invalid API key · Fix external API key",
    'Claude Code returned an error result: Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}',
    "Your access token could not be refreshed. Please log out and sign in again.",
    "Codex Exec exited with code 1: Reading prompt from stdin...\nERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://api.openai.com/v1/responses",
    "workspace routing discovery unauthorized (401)",
    "Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses)",
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

describe("isReconnectNotice", () => {
  it("recognizes Codex's retry notices only", () => {
    expect(
      isReconnectNotice("Reconnecting... 2/5 (stream disconnected before completion)"),
    ).toBe(true);
    expect(isReconnectNotice("workspace routing discovery unauthorized (401)")).toBe(
      false,
    );
  });
});

describe("codexErrorText", () => {
  it("keeps the last Error line of a failed codex exec", () => {
    const message =
      "Codex Exec exited with code 1: 2026-10-07T12:48:52Z ERROR codex_login::auth::manager: Failed to refresh token\n" +
      "Error: thread/resume: thread/resume failed: no rollout found for thread id 01a0e4ae (code -32600)\n";
    expect(codexErrorText(message)).toBe(
      "thread/resume: thread/resume failed: no rollout found for thread id 01a0e4ae (code -32600)",
    );
  });

  it("keeps the message of an API error body", () => {
    expect(
      codexErrorText(
        '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6-sol\' model is not supported when using Codex with a ChatGPT account."}}',
      ),
    ).toBe(
      "The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.",
    );
  });

  it("leaves other messages unchanged", () => {
    expect(codexErrorText("Codex Exec exited with signal SIGTERM: ")).toBe(
      "Codex Exec exited with signal SIGTERM: ",
    );
    expect(codexErrorText("rate limited")).toBe("rate limited");
    expect(codexErrorText("{not json")).toBe("{not json");
  });
});

describe("codexErrorCode", () => {
  it("tags expired logins and models the ChatGPT plan excludes", () => {
    expect(
      codexErrorCode(
        "Reconnecting... 2/5 (workspace routing discovery unauthorized (401))",
      ),
    ).toBe("auth");
    expect(
      codexErrorCode(
        '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6-sol\' model is not supported when using Codex with a ChatGPT account."}}',
      ),
    ).toBe("model_unavailable");
    expect(codexErrorCode("rate limited")).toBeUndefined();
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
