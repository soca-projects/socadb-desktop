import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFORT_BY_PROVIDER,
  EFFORT_LEVELS_BY_MODEL,
  EFFORT_LEVELS_BY_PROVIDER,
  getProviderFromModel,
  makeProvider,
  getAvailableModels,
  PROVIDERS,
  PROVIDER_IDS,
  resolveEffort,
} from "./chat";
import type { EffortLevel, Provider } from "./chat";
import { CLAUDE_EFFORTS, CODEX_EFFORTS } from "../../mcp-server/src/agent-runner-shared";

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

describe("effort allow-lists stay in sync across packages", () => {
  it("claude effort levels match between frontend and agent runner", () => {
    expect([...CLAUDE_EFFORTS]).toEqual(EFFORT_LEVELS_BY_PROVIDER.claude);
  });

  it("codex effort levels match between frontend and agent runner", () => {
    expect([...CODEX_EFFORTS]).toEqual(EFFORT_LEVELS_BY_PROVIDER.codex);
  });
});

describe("EFFORT_LEVELS_BY_PROVIDER equals union of per-model lists", () => {
  function unionForProvider(providerId: "claude" | "codex"): EffortLevel[] {
    const set = new Set<EffortLevel>();
    for (const model of PROVIDERS[providerId].models) {
      for (const level of EFFORT_LEVELS_BY_MODEL[model.id] ?? []) {
        set.add(level);
      }
    }
    const ordered: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
    return ordered.filter((l) => set.has(l));
  }

  it("claude provider list is the union of its models' supported levels", () => {
    expect(EFFORT_LEVELS_BY_PROVIDER.claude).toEqual(unionForProvider("claude"));
  });

  it("codex provider list is the union of its models' supported levels", () => {
    expect(EFFORT_LEVELS_BY_PROVIDER.codex).toEqual(unionForProvider("codex"));
  });

  it("every advertised model has an entry in EFFORT_LEVELS_BY_MODEL", () => {
    for (const id of PROVIDER_IDS) {
      for (const model of PROVIDERS[id].models) {
        expect(EFFORT_LEVELS_BY_MODEL[model.id]).toBeDefined();
      }
    }
  });
});

describe("resolveEffort", () => {
  it("returns stored value when supported by the model", () => {
    const r = resolveEffort("claude-opus-4-7", "xhigh", "claude");
    expect(r.displayed).toBe("xhigh");
    expect(r.toSend).toBe("xhigh");
  });

  it("falls back to provider default when stored is not in the model's list", () => {
    const r = resolveEffort("claude-sonnet-4-6", "xhigh", "claude");
    expect(r.displayed).toBe(DEFAULT_EFFORT_BY_PROVIDER.claude);
    expect(r.toSend).toBe(DEFAULT_EFFORT_BY_PROVIDER.claude);
  });

  it("sends undefined when the model doesn't support effort at all", () => {
    const r = resolveEffort("claude-haiku-4-5", "high", "claude");
    expect(r.toSend).toBeUndefined();
  });

  it("displayed value always equals toSend when the model supports effort", () => {
    for (const id of PROVIDER_IDS) {
      for (const model of PROVIDERS[id].models) {
        const levels = EFFORT_LEVELS_BY_MODEL[model.id] ?? [];
        if (levels.length === 0) continue;
        const candidates: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
        for (const stored of candidates) {
          const r = resolveEffort(model.id, stored, id);
          expect(r.toSend).toBe(r.displayed);
        }
      }
    }
  });
});
