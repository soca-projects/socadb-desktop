# Multi-Provider Architecture (Claude + Codex)

## Overview

Add OpenAI Codex as a second AI provider alongside Claude Code. Both providers can be connected simultaneously. The user switches between them by selecting a model — the provider is deduced automatically.

## Architecture

### Two subprocess runners, switch by model

```
User selects model in ChatPanel
        |
getProviderFromModel("gpt-5.3-codex") → "codex"
getProviderFromModel("claude-sonnet-4-6") → "claude"
        |
        v
Rust routes to correct subprocess
        |
   +---------+---------+
   |                   |
agent-runner-claude  agent-runner-codex
(Claude Agent SDK)   (Codex SDK)
   |                   |
   +------- MCP -------+
        (same socadb-mcp)
```

Each runner is a separate Node.js process. Rust maintains a `HashMap<ProviderId, AgentProcess>`. Both runners communicate with the same SocaDB MCP server via WebSocket.

### Why two processes

- Isolation: one SDK crashing doesn't affect the other
- ESM/CJS: Codex SDK is ESM-only, separating avoids import issues
- Simplicity: each runner is small and focused on one SDK
- Same pattern as Pencil (proven in production)

## Changes by layer

### 1. Types (`types/chat.ts`)

```typescript
type ProviderId = "claude" | "codex";

interface ProviderMeta {
  id: ProviderId;
  name: string;
  models: SupportedModel[];
  apiKeyPlaceholder: string;
  apiKeyMinLength: number;
  consoleUrl: string;
  consoleName: string;
}

const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Anthropic Claude Code",
    models: [
      { id: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable" },
      { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", description: "Fast, balanced" },
      { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", description: "Fastest" },
    ],
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleName: "Anthropic Console",
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex",
    models: [
      { id: "gpt-5.3-codex", displayName: "GPT 5.3 Codex", description: "Best" },
      { id: "gpt-5.4", displayName: "GPT 5.4", description: "Latest" },
      { id: "gpt-5.2-codex", displayName: "GPT 5.2 Codex", description: "Fast" },
    ],
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://platform.openai.com/settings/organization/api-keys",
    consoleName: "OpenAI Dashboard",
  },
};

function getProviderFromModel(modelId: string): ProviderId {
  return modelId.startsWith("gpt-") ? "codex" : "claude";
}
```

Replace `makeClaudeCodeProvider()` with generic `makeProvider(id, connected, method, email)`.

### 2. Store (`chatStore.ts`)

```typescript
// Before
provider: Provider | null;

// After
providers: Record<ProviderId, Provider>;
```

Each provider has independent connected/disconnected state. Actions:
- `setProvider(id, provider)`
- No `activeProviderId` — determined by selected model at send time

### 3. Persistence (`chatPersistence.ts`)

Config file structure:
```json
{
  "providers": {
    "claude": { "id": "claude", "connected": true, "connectionMethod": "subscription", "email": "..." },
    "codex": { "id": "codex", "connected": true, "connectionMethod": "api-key", "email": null }
  },
  "apiKeys": {
    "codex": "sk-proj-..."
  }
}
```

Functions become provider-aware:
- `persistProvider(id, provider)`
- `saveApiKey(id, key)`
- `clearApiKey(id)`
- Migration from old single-provider format

### 4. Provider detection (`providerDetection.ts`)

```typescript
async function detectClaude(): Promise<ProviderStatus> { /* existing logic */ }
async function detectCodex(): Promise<ProviderStatus> { /* new — check codex CLI */ }
async function detectProvider(id: ProviderId): Promise<ProviderStatus> {
  return id === "claude" ? detectClaude() : detectCodex();
}
```

Codex detection: uses a separate `codex-status-check.ts` or equivalent that tries `Codex.startThread()` like Pencil does.

### 5. Rust (`chat.rs`)

```rust
struct AgentState {
    processes: HashMap<String, AgentProcess>,
    api_keys: HashMap<String, String>,
}
```

- `spawn_agent(provider_id, api_key)` → spawns the correct runner binary
- `chat_send(provider_id, message, ...)` → routes to correct process
- `chat_set_api_key(provider_id, api_key)` → per-provider key storage
- `chat_reset(provider_id)` → kills specific provider process
- `ensure_agent(provider_id)` → spawns only the requested provider

### 6. Agent runners

**`agent-runner-claude.ts`** (rename from `agent-runner.ts`)
- No changes to logic, just renamed
- Uses `@anthropic-ai/claude-agent-sdk`

**`agent-runner-codex.ts`** (new)
- Uses `@openai/codex-sdk` (ESM dynamic import)
- Same JSONL protocol: `chat_send`, `chat_stop`, `chat_status`
- Same event types: `text_delta`, `tool_use`, `tool_result`, `done`, `error`, `session_init`
- Status check: `Codex.startThread()` + `thread.runStreamed("2+2")` (no accountInfo API)
- MCP: same `socadb-mcp` binary passed as `mcp_servers.socadb`

### 7. Chat commands (`chatCommands.ts`)

```typescript
function sendChatMessage(message, systemPrompt, providerId, sessionId?, model?) {
  void invoke("chat_send", { providerId, message, systemPrompt, sessionId, model });
}
```

Provider ID flows through all commands. Error handling becomes provider-aware (Claude "not logged in" vs Codex equivalent).

### 8. UI

**AgentSetupModal**: Two provider rows, each with:
- Icon + name + status
- "Sign in with..." dropdown (subscription / API key)
- Independent connect/disconnect per provider

**ChatPanel**: Model selector shows models from all connected providers:
- If only Claude connected → Claude models only
- If only Codex connected → GPT models only
- If both → all models, grouped by provider
- Selected model determines which subprocess handles the message

## Migration

Old config format (single provider):
```json
{ "provider": {...}, "apiKey": "sk-ant-..." }
```

New format:
```json
{ "providers": { "claude": {...} }, "apiKeys": { "claude": "sk-ant-..." } }
```

`initChatPersistence` detects old format and migrates automatically.

## What stays the same

- MCP server — both providers use the same `socadb-mcp` binary and WebSocket bridge
- MCP tools — provider-agnostic, operate on schema store
- Conversation model — messages don't track provider (not needed for now)
- JSONL protocol between Rust and runners — same event types

## Dependencies

New npm:
- `@openai/codex-sdk` (in mcp-server/)

No new Rust crates needed.
