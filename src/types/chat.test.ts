import { describe, it, expect } from "vitest";
import {
  getProviderFromModel,
  makeProvider,
  getAvailableModels,
  PROVIDERS,
  PROVIDER_IDS,
} from "./chat";
import type { Provider } from "./chat";

describe("getProviderFromModel", () => {
  it("returns claude for claude models", () => {
    expect(getProviderFromModel("claude-opus-4-7")).toBe("claude");
    expect(getProviderFromModel("claude-sonnet-4-6")).toBe("claude");
    expect(getProviderFromModel("claude-haiku-4-5")).toBe("claude");
  });

  it("returns codex for gpt models", () => {
    expect(getProviderFromModel("gpt-5.5")).toBe("codex");
    expect(getProviderFromModel("gpt-5.4")).toBe("codex");
    expect(getProviderFromModel("gpt-5.4-mini")).toBe("codex");
  });

  it("defaults to claude for unknown models", () => {
    expect(getProviderFromModel("some-unknown-model")).toBe("claude");
  });
});

describe("makeProvider", () => {
  it("creates a connected provider with subscription", () => {
    const p = makeProvider("claude", true, "subscription", "test@example.com");
    expect(p).toEqual({
      id: "claude",
      name: "Anthropic",
      connected: true,
      connectionMethod: "subscription",
      email: "test@example.com",
    });
  });

  it("creates a disconnected provider", () => {
    const p = makeProvider("codex", false, null, null);
    expect(p).toEqual({
      id: "codex",
      name: "OpenAI",
      connected: false,
      connectionMethod: null,
      email: null,
    });
  });

  it("creates a provider with api-key connection", () => {
    const p = makeProvider("codex", true, "api-key", null);
    expect(p.connected).toBe(true);
    expect(p.connectionMethod).toBe("api-key");
    expect(p.email).toBeNull();
  });

  it("uses the correct name from PROVIDERS registry", () => {
    const claude = makeProvider("claude", false, null, null);
    const codex = makeProvider("codex", false, null, null);
    expect(claude.name).toBe(PROVIDERS.claude.name);
    expect(codex.name).toBe(PROVIDERS.codex.name);
  });
});

describe("getAvailableModels", () => {
  it("returns empty array when no providers connected", () => {
    const providers: Record<string, Provider> = {};
    expect(getAvailableModels(providers)).toEqual([]);
  });

  it("returns claude models when only claude connected", () => {
    const providers: Record<string, Provider> = {
      claude: makeProvider("claude", true, "subscription", null),
    };
    const models = getAvailableModels(providers);
    expect(models).toEqual(PROVIDERS.claude.models);
  });

  it("returns codex models when only codex connected", () => {
    const providers: Record<string, Provider> = {
      codex: makeProvider("codex", true, "api-key", null),
    };
    const models = getAvailableModels(providers);
    expect(models).toEqual(PROVIDERS.codex.models);
  });

  it("returns all models when both connected", () => {
    const providers: Record<string, Provider> = {
      claude: makeProvider("claude", true, "subscription", null),
      codex: makeProvider("codex", true, "api-key", null),
    };
    const models = getAvailableModels(providers);
    expect(models.length).toBe(
      PROVIDERS.claude.models.length + PROVIDERS.codex.models.length,
    );
    expect(models[0].id).toBe("claude-opus-4-7");
    expect(models[models.length - 1].id).toBe("gpt-5.4-mini");
  });

  it("excludes disconnected providers", () => {
    const providers: Record<string, Provider> = {
      claude: makeProvider("claude", true, "subscription", null),
      codex: makeProvider("codex", false, null, null),
    };
    const models = getAvailableModels(providers);
    expect(models).toEqual(PROVIDERS.claude.models);
  });
});

describe("PROVIDERS registry", () => {
  it("has entries for all PROVIDER_IDS", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id]).toBeDefined();
      expect(PROVIDERS[id].id).toBe(id);
      expect(PROVIDERS[id].models.length).toBeGreaterThan(0);
    }
  });

  it("claude models start with claude-", () => {
    for (const model of PROVIDERS.claude.models) {
      expect(model.id.startsWith("claude-")).toBe(true);
    }
  });

  it("codex models start with gpt-", () => {
    for (const model of PROVIDERS.codex.models) {
      expect(model.id.startsWith("gpt-")).toBe(true);
    }
  });
});
