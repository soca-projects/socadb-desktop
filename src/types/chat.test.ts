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
import type { EffortLevel } from "./chat";
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
  it("defaults to subscription with no stored key", () => {
    const p = makeProvider("claude");
    expect(p).toEqual({
      id: "claude",
      name: "Anthropic",
      loginType: "subscription",
      apiKeyStored: false,
    });
  });

  it("creates an api-key provider with stored flag", () => {
    const p = makeProvider("codex", "api-key", true);
    expect(p).toEqual({
      id: "codex",
      name: "OpenAI",
      loginType: "api-key",
      apiKeyStored: true,
    });
  });

  it("uses the correct name from PROVIDERS registry", () => {
    expect(makeProvider("claude").name).toBe(PROVIDERS.claude.name);
    expect(makeProvider("codex").name).toBe(PROVIDERS.codex.name);
  });
});

describe("getAvailableModels", () => {
  it("returns every model across providers", () => {
    const models = getAvailableModels();
    expect(models.length).toBe(
      PROVIDERS.claude.models.length + PROVIDERS.codex.models.length,
    );
    expect(models[0].id).toBe("claude-opus-4-7");
    expect(models[models.length - 1].id).toBe("gpt-5.4-mini");
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
