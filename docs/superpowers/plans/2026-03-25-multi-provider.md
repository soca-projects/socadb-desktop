# Multi-Provider (Claude + Codex) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenAI Codex as a second AI provider, with both providers connectable simultaneously and implicit switching via model selection.

**Architecture:** Two separate Node.js subprocess runners (`agent-runner-claude.ts`, `agent-runner-codex.ts`), each using its own SDK. Rust maintains a `HashMap<String, AgentProcess>` to manage them independently. The selected model ID determines which provider subprocess handles each message.

**Tech Stack:** `@openai/codex-sdk` (ESM, dynamic import), `@anthropic-ai/claude-agent-sdk` (existing), Tauri v2 (Rust), React 19, Zustand 5, Zod 4

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types/chat.ts` | `ProviderId` union, `PROVIDERS` registry, `getProviderFromModel()`, generic `makeProvider()` |
| Modify | `src/stores/chatStore.ts` | `providers: Record<ProviderId, Provider>` instead of single `provider` |
| Modify | `src/utils/chatPersistence.ts` | Multi-provider config format, migration, per-provider API key storage |
| Modify | `src/utils/chatCommands.ts` | Provider-aware commands (`sendChatMessage` gets `providerId`), provider-aware error handling |
| Modify | `src/utils/providerDetection.ts` | Add `detectCodex()`, generic `detectProvider(id)` |
| Modify | `src/utils/zodSchemas.ts` | Add `ProviderId` to `ChatStatusResultZ` |
| Rename | `mcp-server/src/agent-runner.ts` → `mcp-server/src/agent-runner-claude.ts` | Claude-specific runner (no logic changes) |
| Create | `mcp-server/src/agent-runner-codex.ts` | Codex runner using `@openai/codex-sdk` |
| Modify | `src-tauri/src/chat.rs` | `HashMap` process pool, provider-aware commands |
| Modify | `src-tauri/src/lib.rs` | Register updated command signatures |
| Modify | `src/components/AgentSetupModal/AgentSetupModal.tsx` | Two provider rows, per-provider connect/disconnect |
| Modify | `src/components/ChatPanel/ChatPanel.tsx` | Model selector shows models from connected providers |
| Create | `src/assets/icons/CodexIcon.tsx` | OpenAI Codex icon SVG component |
| Modify | `src-tauri/capabilities/default.json` | Add `$HOME/.codex/**` to fs scope (if not already) |
| Modify | `CLAUDE.md` | Document multi-provider architecture |

---

### Task 1: Type System — ProviderId, PROVIDERS registry, makeProvider

**Files:**
- Modify: `src/types/chat.ts`

- [ ] **Step 1: Update ProviderId and add PROVIDERS registry**

Replace the current single-provider types with the multi-provider registry:

```typescript
export type ProviderId = "claude" | "codex";

export type ConnectionMethod = "subscription" | "api-key";

export interface Provider {
  id: ProviderId;
  name: string;
  connected: boolean;
  connectionMethod: ConnectionMethod | null;
  email: string | null;
}

export interface SupportedModel {
  id: string;
  displayName: string;
  description: string;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  icon: string;
  models: SupportedModel[];
  apiKeyPlaceholder: string;
  apiKeyMinLength: number;
  consoleUrl: string;
  consoleName: string;
  subscriptionLabel: string;
  installCommand: string;
  startCommand: string;
  loginCommand: string;
  logoutCommand: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Anthropic Claude Code",
    icon: "claude",
    models: [
      { id: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable" },
      { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", description: "Fast, balanced" },
      { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", description: "Fastest" },
    ],
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleName: "Anthropic Console",
    subscriptionLabel: "Claude Subscription (Pro, Max...)",
    installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
    startCommand: "claude",
    loginCommand: "claude /login",
    logoutCommand: "claude /logout",
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex",
    icon: "codex",
    models: [
      { id: "gpt-5.3-codex", displayName: "GPT 5.3 Codex", description: "Best" },
      { id: "gpt-5.4", displayName: "GPT 5.4", description: "Latest" },
      { id: "gpt-5.2-codex", displayName: "GPT 5.2 Codex", description: "Fast" },
    ],
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://platform.openai.com/settings/organization/api-keys",
    consoleName: "OpenAI Dashboard",
    subscriptionLabel: "ChatGPT Subscription (Plus, Pro...)",
    installCommand: "npm install -g @openai/codex",
    startCommand: "codex",
    loginCommand: "codex auth login",
    logoutCommand: "codex auth logout",
  },
};

export const PROVIDER_IDS: ProviderId[] = ["claude", "codex"];

export function getProviderFromModel(modelId: string): ProviderId {
  return modelId.startsWith("gpt-") ? "codex" : "claude";
}

export function makeProvider(
  id: ProviderId,
  connected: boolean,
  connectionMethod: ConnectionMethod | null,
  email: string | null,
): Provider {
  return { id, name: PROVIDERS[id].name, connected, connectionMethod, email };
}

export function getAvailableModels(
  providers: Record<ProviderId, Provider>,
): SupportedModel[] {
  return PROVIDER_IDS.flatMap((id) =>
    providers[id]?.connected ? PROVIDERS[id].models : [],
  );
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";
```

Remove the old `makeClaudeCodeProvider()` and `SUPPORTED_MODELS`.

- [ ] **Step 2: Run typecheck to see all breakages**

Run: `npm run typecheck 2>&1 | head -40`
Expected: Multiple errors in files that import old types. This is expected — we'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types/chat.ts
git commit -m "feat: add multi-provider type system with PROVIDERS registry"
```

---

### Task 2: Store — Multi-provider state

**Files:**
- Modify: `src/stores/chatStore.ts`

- [ ] **Step 1: Replace single provider with providers map**

In `chatStore.ts`, change the state interface and action:

```typescript
// In ChatState interface, replace:
//   provider: Provider | null;
//   setProvider: (provider: Provider) => void;
// With:
providers: Record<string, Provider>;
setProvider: (id: string, provider: Provider) => void;
```

Update the store implementation:

```typescript
// In the create() call, replace:
//   provider: null,
// With:
providers: {},

// Replace:
//   setProvider: (provider) => set({ provider }),
// With:
setProvider: (id, provider) => set((state) => ({
  providers: { ...state.providers, [id]: provider },
})),
```

- [ ] **Step 2: Run typecheck to verify store changes**

Run: `npm run typecheck 2>&1 | head -40`
Expected: Errors in chatCommands.ts, chatPersistence.ts, AgentSetupModal.tsx, ChatPanel.tsx — all the consumers of `provider`/`setProvider`.

- [ ] **Step 3: Commit**

```bash
git add src/stores/chatStore.ts
git commit -m "feat: change chatStore to multi-provider state"
```

---

### Task 3: Persistence — Multi-provider config format + migration

**Files:**
- Modify: `src/utils/chatPersistence.ts`

- [ ] **Step 1: Update ConfigFile interface and all functions**

```typescript
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useChatStore } from "../stores/chatStore";
import { detectProvider } from "./providerDetection";
import { setApiKey as setApiKeyOnAgent } from "./chatCommands";
import type { Conversation, Provider, ProviderId } from "../types/chat";
import { makeProvider, PROVIDER_IDS } from "../types/chat";

interface ConversationsFile {
  conversations: Conversation[];
}

interface ConfigFile {
  providers?: Record<string, Provider>;
  apiKeys?: Record<string, string>;
  // Legacy fields for migration
  provider?: Provider | null;
  apiKey?: string;
}

let socadbDir: string | null = null;

async function getSocadbDir(): Promise<string> {
  if (!socadbDir) {
    const home = await homeDir();
    socadbDir = `${home}.socadb/`;
  }
  return socadbDir;
}

async function conversationsPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}conversations.json`;
}

async function configPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}config.json`;
}

async function saveConversations() {
  try {
    const { conversations } = useChatStore.getState();
    const data: ConversationsFile = { conversations };
    await writeTextFile(await conversationsPath(), JSON.stringify(data));
  } catch {
    // Write failed — silently ignore
  }
}

async function loadConversations() {
  try {
    const content = await readTextFile(await conversationsPath());
    const data = JSON.parse(content) as ConversationsFile;
    if (data.conversations?.length > 0) {
      useChatStore.getState().setConversations(data.conversations);
    }
  } catch {
    // File doesn't exist yet — first launch
  }

  if (useChatStore.getState().conversations.length === 0) {
    useChatStore.getState().newConversation();
  }
}

async function loadConfigFile(): Promise<ConfigFile | null> {
  try {
    const content = await readTextFile(await configPath());
    return JSON.parse(content) as ConfigFile;
  } catch {
    return null;
  }
}

function migrateConfig(config: ConfigFile): ConfigFile {
  // Migrate from old single-provider format
  if (config.provider && !config.providers) {
    const oldProvider = config.provider;
    const id = oldProvider.id === "claude-code" ? "claude" : (oldProvider.id as string);
    const migrated: Provider = {
      ...oldProvider,
      id: id as ProviderId,
      name: oldProvider.name,
    };
    const result: ConfigFile = {
      providers: { [id]: migrated },
    };
    if (config.apiKey) {
      result.apiKeys = { [id]: config.apiKey };
    }
    return result;
  }
  return config;
}

async function saveConfig(config: ConfigFile) {
  try {
    const { provider: _, apiKey: __, ...clean } = config;
    await writeTextFile(await configPath(), JSON.stringify(clean));
  } catch {
    // Write failed — silently ignore
  }
}

export async function saveProviderConfig(id: ProviderId, provider: Provider) {
  try {
    const existing = await loadConfigFile();
    const config = existing ? migrateConfig(existing) : {};
    const providers = { ...(config.providers ?? {}), [id]: provider };
    await saveConfig({ ...config, providers });
  } catch {
    // Write failed — silently ignore
  }
}

export function persistProvider(id: ProviderId, provider: Provider) {
  useChatStore.getState().setProvider(id, provider);
  void saveProviderConfig(id, provider);
}

export async function saveApiKey(id: ProviderId, apiKey: string) {
  try {
    const existing = await loadConfigFile();
    const config = existing ? migrateConfig(existing) : {};
    const apiKeys = { ...(config.apiKeys ?? {}), [id]: apiKey };
    await saveConfig({ ...config, apiKeys });
  } catch {
    // Write failed — silently ignore
  }
}

export async function clearApiKey(id: ProviderId) {
  try {
    const existing = await loadConfigFile();
    if (existing) {
      const config = migrateConfig(existing);
      const apiKeys = { ...(config.apiKeys ?? {}) };
      delete apiKeys[id];
      await saveConfig({ ...config, apiKeys });
    }
  } catch {
    // Write failed — silently ignore
  }
}

export function initChatPersistence() {
  void loadConversations();
  void loadConfigFile().then(async (raw) => {
    const config = raw ? migrateConfig(raw) : {};

    // Restore API keys to Rust
    if (config.apiKeys) {
      for (const [id, key] of Object.entries(config.apiKeys)) {
        setApiKeyOnAgent(id as ProviderId, key);
      }
    }

    // Restore persisted providers
    if (config.providers) {
      for (const [id, provider] of Object.entries(config.providers)) {
        if (provider.connected) {
          useChatStore.getState().setProvider(id, provider);
        }
      }
    }

    // Auto-detect providers not yet connected
    for (const id of PROVIDER_IDS) {
      const existing = config.providers?.[id];
      if (!existing?.connected) {
        try {
          const result = await detectProvider(id);
          if (result.authenticated) {
            persistProvider(
              id,
              makeProvider(
                id,
                true,
                result.loginType === "api-key" ? "api-key" : "subscription",
                result.email,
              ),
            );
          }
        } catch {
          // Detection failed — skip this provider
        }
      }
    }
  });

  useChatStore.subscribe(saveConversations);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/utils/chatPersistence.ts
git commit -m "feat: multi-provider config persistence with migration"
```

---

### Task 4: Provider Detection — Add detectCodex, generic detectProvider

**Files:**
- Modify: `src/utils/providerDetection.ts`
- Modify: `src/utils/chatCommands.ts`

- [ ] **Step 1: Update chatCommands to be provider-aware**

All commands now take a `providerId` parameter:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "../stores/chatStore";
import type { ChatStatusResult, ChatEvent, ProviderId } from "../types/chat";
import { DEFAULT_MODEL, makeProvider, getProviderFromModel, PROVIDERS } from "../types/chat";
import { ChatStatusResultZ, ChatErrorZ } from "./zodSchemas";

let statusResolve: ((result: ChatStatusResult) => void) | null = null;

function ensureAssistantMessage() {
  const store = useChatStore.getState();
  const last = store.messages[store.messages.length - 1];
  if (!last || last.role !== "assistant") {
    store.startAssistantMessage();
  }
}

export function handleChatEvent(parsed: ChatEvent) {
  if (parsed.type === "chat_status_result") {
    const parse = ChatStatusResultZ.safeParse(parsed);
    if (!parse.success) return;
    const result: ChatStatusResult = parse.data;
    if (statusResolve) {
      statusResolve(result);
      statusResolve = null;
    }
    return;
  }

  if (parsed.type !== "chat_event") return;

  const store = useChatStore.getState();

  switch (parsed.event) {
    case "session_init":
      store.setSessionId((parsed.sessionId as string) ?? null);
      break;

    case "text_delta":
      ensureAssistantMessage();
      store.appendAssistantText(parsed.text as string);
      break;

    case "tool_use":
      ensureAssistantMessage();
      store.addToolCall({
        id: parsed.toolUseId as string,
        name: parsed.toolName as string,
        input: (parsed.toolInput as Record<string, unknown>) ?? {},
        result: null,
        isSuccess: false,
      });
      break;

    case "tool_result":
      store.updateLastToolCall(
        parsed.toolUseId as string,
        typeof parsed.output === "string"
          ? parsed.output
          : JSON.stringify(parsed.output ?? ""),
        !(parsed.isError as boolean),
      );
      break;

    case "done":
      if (parsed.response) {
        ensureAssistantMessage();
        store.setAssistantText(parsed.response as string);
      }
      store.finishResponse((parsed.sessionId as string) ?? "");
      break;

    case "error": {
      ensureAssistantMessage();
      const errorParse = ChatErrorZ.safeParse(parsed);
      const errorMsg = errorParse.success ? errorParse.data.message : "Unknown error";
      const lower = errorMsg.toLowerCase();
      const providerId = (parsed.providerId as ProviderId) ?? "claude";
      const meta = PROVIDERS[providerId];

      if (lower.includes("not logged in")) {
        store.appendAssistantText(`Error: ${errorMsg}`);
        store.setProvider(providerId, makeProvider(providerId, false, null, null));
      } else if (lower.includes("credit balance")) {
        store.appendAssistantText(
          `Error: ${errorMsg}\n\nAdd credits on the [${meta.consoleName}](${meta.consoleUrl}), then try again. If it still fails, reconnect your API key in Settings.`,
        );
        resetAgent(providerId);
      } else {
        store.appendAssistantText(`Error: ${errorMsg}`);
      }
      store.finishResponse("");
      break;
    }
  }
}

export function sendChatMessage(
  message: string,
  systemPrompt: string,
  providerId: ProviderId,
  sessionId?: string,
  model?: string,
) {
  void invoke("chat_send", {
    providerId,
    message,
    systemPrompt,
    sessionId: sessionId ?? null,
    model: model ?? DEFAULT_MODEL,
  });
}

export function stopChat(providerId: ProviderId) {
  void invoke("chat_stop", { providerId });
}

function requestStatus(command: string, providerId: ProviderId): Promise<ChatStatusResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      statusResolve = null;
      reject(new Error("Status check timed out"));
    }, 10000);

    statusResolve = (result) => {
      clearTimeout(timeout);
      resolve(result);
    };

    void invoke(command, { providerId });
  });
}

export function initChat(providerId: ProviderId): Promise<ChatStatusResult> {
  return requestStatus("chat_init", providerId);
}

export function checkChatStatus(providerId: ProviderId): Promise<ChatStatusResult> {
  return requestStatus("chat_status", providerId);
}

export function setApiKey(providerId: ProviderId, apiKey: string | null) {
  void invoke("chat_set_api_key", { providerId, apiKey });
}

export function resetAgent(providerId: ProviderId) {
  void invoke("chat_reset", { providerId });
}
```

- [ ] **Step 2: Update providerDetection.ts**

```typescript
import { checkChatStatus } from "./chatCommands";
import type { ChatStatusResult, ProviderId } from "../types/chat";

export interface ProviderStatus {
  installed: boolean;
  authenticated: boolean;
  email: string | null;
  loginType: string | null;
}

export async function detectProvider(id: ProviderId): Promise<ProviderStatus> {
  try {
    const status: ChatStatusResult = await checkChatStatus(id);
    return {
      installed: true,
      authenticated: status.loggedIn,
      email: status.email,
      loginType: status.loginType,
    };
  } catch {
    return { installed: false, authenticated: false, email: null, loginType: null };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/chatCommands.ts src/utils/providerDetection.ts
git commit -m "feat: provider-aware chat commands and detection"
```

---

### Task 5: Rust — Multi-process agent pool

**Files:**
- Modify: `src-tauri/src/chat.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Refactor chat.rs for HashMap-based process pool**

```rust
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

struct AgentProcess {
    stdin: tokio::process::ChildStdin,
}

struct AgentState {
    processes: HashMap<String, AgentProcess>,
    api_keys: HashMap<String, String>,
}

static AGENT: std::sync::OnceLock<Arc<Mutex<AgentState>>> = std::sync::OnceLock::new();

fn get_agent() -> &'static Arc<Mutex<AgentState>> {
    AGENT.get_or_init(|| {
        Arc::new(Mutex::new(AgentState {
            processes: HashMap::new(),
            api_keys: HashMap::new(),
        }))
    })
}

fn agent_runner_path(provider_id: &str) -> String {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let filename = format!("agent-runner-{provider_id}.ts");
    manifest_dir
        .parent()
        .unwrap()
        .join("mcp-server")
        .join("src")
        .join(filename)
        .to_string_lossy()
        .to_string()
}

fn api_key_env_var(provider_id: &str) -> &'static str {
    match provider_id {
        "codex" => "OPENAI_API_KEY",
        _ => "ANTHROPIC_API_KEY",
    }
}

async fn spawn_agent(
    app: &AppHandle,
    provider_id: &str,
    api_key: Option<&str>,
) -> Result<AgentProcess, String> {
    let mut cmd = Command::new("npx");
    cmd.args(["tsx", &agent_runner_path(provider_id)])
        .current_dir(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("mcp-server"),
        )
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(key) = api_key {
        cmd.env(api_key_env_var(provider_id), key);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn agent-runner-{provider_id}: {e}"))?;

    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let pid = provider_id.to_string();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let _ = app_clone.emit("chat-stream", StreamEvent { raw: line });
        }

        let _ = child.wait().await;
        let mut guard = get_agent().lock().await;
        guard.processes.remove(&pid);
    });

    if let Some(stderr) = stderr {
        let pid = provider_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[agent-runner-{pid}] {line}");
            }
        });
    }

    Ok(AgentProcess { stdin })
}

async fn ensure_agent(app: &AppHandle, provider_id: &str) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;

    if guard.processes.contains_key(provider_id) {
        return Ok(());
    }

    let api_key = guard.api_keys.get(provider_id).cloned();
    let process = spawn_agent(app, provider_id, api_key.as_deref()).await?;
    guard.processes.insert(provider_id.to_string(), process);
    Ok(())
}

async fn send_to_agent_inner(provider_id: &str, cmd: &serde_json::Value) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    let process = guard
        .processes
        .get_mut(provider_id)
        .ok_or("Agent not running")?;
    let line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
    process
        .stdin
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|e| {
            guard.processes.remove(provider_id);
            format!("Failed to write to agent: {e}")
        })
}

async fn send_to_agent(
    app: &AppHandle,
    provider_id: &str,
    cmd: &serde_json::Value,
) -> Result<(), String> {
    if send_to_agent_inner(provider_id, cmd).await.is_ok() {
        return Ok(());
    }

    eprintln!("[chat] Agent {provider_id} dead, restarting...");
    ensure_agent(app, provider_id).await?;
    send_to_agent_inner(provider_id, cmd).await
}

#[derive(Serialize, Clone)]
struct StreamEvent {
    raw: String,
}

#[tauri::command]
pub async fn chat_init(app: AppHandle, provider_id: String) -> Result<(), String> {
    ensure_agent(&app, &provider_id).await?;
    send_to_agent(&app, &provider_id, &serde_json::json!({ "type": "chat_init" })).await
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    provider_id: String,
    message: String,
    system_prompt: String,
    session_id: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    ensure_agent(&app, &provider_id).await?;
    send_to_agent(
        &app,
        &provider_id,
        &serde_json::json!({
            "type": "chat_send",
            "message": message,
            "systemPrompt": system_prompt,
            "sessionId": session_id,
            "model": model,
        }),
    )
    .await
}

#[tauri::command]
pub async fn chat_stop(app: AppHandle, provider_id: String) -> Result<(), String> {
    send_to_agent(&app, &provider_id, &serde_json::json!({ "type": "chat_stop" })).await
}

#[tauri::command]
pub async fn chat_status(app: AppHandle, provider_id: String) -> Result<(), String> {
    ensure_agent(&app, &provider_id).await?;
    send_to_agent(&app, &provider_id, &serde_json::json!({ "type": "chat_status" })).await
}

#[tauri::command]
pub async fn chat_set_api_key(provider_id: String, api_key: Option<String>) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    match api_key {
        Some(key) => { guard.api_keys.insert(provider_id.clone(), key); }
        None => { guard.api_keys.remove(&provider_id); }
    }
    guard.processes.remove(&provider_id);
    Ok(())
}

#[tauri::command]
pub async fn chat_reset(provider_id: String) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    guard.processes.remove(&provider_id);
    Ok(())
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check 2>&1`
Expected: PASS

- [ ] **Step 3: Run cargo fmt**

Run: `cd src-tauri && cargo fmt`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/chat.rs src-tauri/src/lib.rs
git commit -m "feat: multi-process agent pool in Rust"
```

---

### Task 6: Agent Runner — Rename Claude, create Codex runner

**Files:**
- Rename: `mcp-server/src/agent-runner.ts` → `mcp-server/src/agent-runner-claude.ts`
- Create: `mcp-server/src/agent-runner-codex.ts`

- [ ] **Step 1: Rename existing runner**

```bash
cd mcp-server/src
git mv agent-runner.ts agent-runner-claude.ts
```

No code changes needed in agent-runner-claude.ts.

- [ ] **Step 2: Install Codex SDK**

```bash
cd mcp-server
npm install @openai/codex-sdk
```

- [ ] **Step 3: Create agent-runner-codex.ts**

```typescript
#!/usr/bin/env node
import { createInterface } from "readline";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { platform, arch } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getMcpBinaryPath(): string {
  const os = platform() === "darwin" ? "darwin" : platform() === "win32" ? "windows" : "linux";
  const cpu = arch() === "arm64" ? "arm64" : arch();
  const ext = os === "windows" ? ".exe" : "";
  const binaryName = `socadb-mcp-${os}-${cpu}${ext}`;
  const distPath = join(__dirname, "..", "dist", binaryName);
  if (existsSync(distPath)) return distPath;
  return join(__dirname, "..", "dist", "socadb-mcp");
}

interface ChatSendCommand {
  type: "chat_send";
  message: string;
  systemPrompt: string;
  sessionId?: string;
  model?: string;
}

interface ChatStopCommand {
  type: "chat_stop";
}

interface ChatStatusCommand {
  type: "chat_status" | "chat_init";
}

type Command = ChatSendCommand | ChatStopCommand | ChatStatusCommand;

function emit(event: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleChatSend(cmd: ChatSendCommand) {
  abortController = new AbortController();
  console.error("[codex-agent] handleChatSend", cmd.message.slice(0, 50));

  try {
    const { Codex } = await import("@openai/codex-sdk");

    const codex = new Codex({
      config: {
        developer_instructions: cmd.systemPrompt,
        mcp_servers: {
          socadb: {
            command: getMcpBinaryPath(),
            args: [],
            env: {},
          },
        },
      },
    });

    const threadOptions = {
      model: cmd.model ?? "gpt-5.3-codex",
      skipGitRepoCheck: true,
      webSearchEnabled: true,
      sandboxMode: "danger-full-access" as const,
      approvalPolicy: "never" as const,
      modelReasoningEffort: "low" as const,
    };

    const thread = cmd.sessionId
      ? codex.resumeThread(cmd.sessionId, threadOptions)
      : codex.startThread(threadOptions);

    const { events } = await thread.runStreamed(cmd.message, {
      signal: abortController.signal,
    });

    let finalResponse = "";

    for await (const event of events) {
      switch (event.type) {
        case "thread.started":
          currentSessionId = event.thread_id;
          emit({
            type: "chat_event",
            event: "session_init",
            sessionId: currentSessionId,
          });
          break;

        case "item.started": {
          const item = event.item;
          if (item.type === "mcp_tool_call") {
            emit({
              type: "chat_event",
              event: "tool_use",
              toolName: item.tool,
              toolInput: item.arguments,
              toolUseId: item.id,
            });
          }
          if (item.type === "agent_message") {
            emit({
              type: "chat_event",
              event: "text_delta",
              text: item.text,
            });
          }
          break;
        }

        case "item.completed": {
          const item = event.item;
          if (item.type === "agent_message") {
            finalResponse = item.text;
            emit({
              type: "chat_event",
              event: "text_delta",
              text: item.text,
            });
          }
          if (item.type === "mcp_tool_call") {
            emit({
              type: "chat_event",
              event: "tool_result",
              toolUseId: item.id,
              output: item.status === "failed" ? item.error?.message : item.result?.content,
              isError: item.status === "failed",
            });
          }
          break;
        }

        case "error":
          emit({
            type: "chat_event",
            event: "error",
            message: event.message,
            providerId: "codex",
          });
          break;
      }
    }

    emit({
      type: "chat_event",
      event: "done",
      response: finalResponse,
      sessionId: currentSessionId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[codex-agent] error:", errorMessage);
    emit({
      type: "chat_event",
      event: "error",
      message: errorMessage,
      providerId: "codex",
    });
  } finally {
    abortController = undefined;
  }
}

function handleChatStop() {
  if (abortController) {
    abortController.abort();
  }
}

async function handleChatStatus() {
  try {
    const { Codex } = await import("@openai/codex-sdk");
    const codex = new Codex();
    const abortCtrl = new AbortController();

    const thread = codex.startThread({
      model: "gpt-5.2-codex",
      skipGitRepoCheck: true,
      modelReasoningEffort: "low",
    });

    const { events } = await thread.runStreamed("what is 2+2?", {
      signal: abortCtrl.signal,
    });

    for await (const event of events) {
      if (event.type === "error") {
        abortCtrl.abort();
        emit({
          type: "chat_status_result",
          loggedIn: false,
          email: null,
          loginType: null,
        });
        return;
      }
      if (event.type === "item.completed") {
        abortCtrl.abort();
        emit({
          type: "chat_status_result",
          loggedIn: true,
          email: null,
          loginType: "subscription",
        });
        return;
      }
    }

    emit({
      type: "chat_status_result",
      loggedIn: false,
      email: null,
      loginType: null,
    });
  } catch {
    emit({
      type: "chat_status_result",
      loggedIn: false,
      email: null,
      loginType: null,
    });
  }
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  try {
    const cmd = JSON.parse(line) as Command;

    switch (cmd.type) {
      case "chat_send":
        void handleChatSend(cmd);
        break;
      case "chat_stop":
        handleChatStop();
        break;
      case "chat_status":
      case "chat_init":
        void handleChatStatus();
        break;
    }
  } catch {
    emit({ type: "chat_event", event: "error", message: "Invalid command" });
  }
});

rl.on("close", () => {
  process.exit(0);
});

emit({ type: "ready" });
```

- [ ] **Step 4: Commit**

```bash
git add mcp-server/
git commit -m "feat: add agent-runner-codex with Codex SDK integration"
```

---

### Task 7: Codex Icon

**Files:**
- Create: `src/assets/icons/CodexIcon.tsx`

- [ ] **Step 1: Create OpenAI Codex icon component**

Create `src/assets/icons/CodexIcon.tsx` using the OpenAI logo SVG (same pattern as `ClaudeIcon.tsx`). Check the existing ClaudeIcon for the pattern:

```bash
cat src/assets/icons/ClaudeIcon.tsx
```

Then create CodexIcon with the OpenAI logo SVG, matching the same interface (`{ size }: { size: number }`).

- [ ] **Step 2: Commit**

```bash
git add src/assets/icons/CodexIcon.tsx
git commit -m "feat: add CodexIcon component"
```

---

### Task 8: AgentSetupModal — Multi-provider UI

**Files:**
- Modify: `src/components/AgentSetupModal/AgentSetupModal.tsx`

- [ ] **Step 1: Refactor for multi-provider support**

The modal needs to show two independent provider rows. Extract the current Claude-specific logic into a generic `ProviderRow` component that takes a `ProviderId` and renders the appropriate status, connection options, and subscription instructions.

Key changes:
- Import `PROVIDERS`, `PROVIDER_IDS`, `makeProvider`, `getProviderFromModel` from `types/chat.ts`
- Import `CodexIcon` for the Codex row
- Replace `useChatStore((s) => s.provider)` with `useChatStore((s) => s.providers)`
- Each provider row has its own detection, connect, disconnect logic
- `SignInDropdown` uses `PROVIDERS[id].subscriptionLabel` and `PROVIDERS[id]` metadata
- Subscription instructions use `PROVIDERS[id].installCommand`, `startCommand`, `loginCommand`
- API key view uses `PROVIDERS[id].apiKeyPlaceholder`, `consoleUrl`, `consoleName`, `apiKeyMinLength`
- `persistProvider(id, provider)` and `saveApiKey(id, key)` take provider ID

- [ ] **Step 2: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentSetupModal/AgentSetupModal.tsx
git commit -m "feat: multi-provider AgentSetupModal UI"
```

---

### Task 9: ChatPanel — Model selector from connected providers

**Files:**
- Modify: `src/components/ChatPanel/ChatPanel.tsx`

- [ ] **Step 1: Update model selector and send logic**

```typescript
// Replace import:
//   import { SUPPORTED_MODELS, DEFAULT_MODEL } from "../../types/chat";
// With:
import { DEFAULT_MODEL, getAvailableModels, getProviderFromModel } from "../../types/chat";
import type { ProviderId } from "../../types/chat";

// Replace:
//   const provider = useChatStore((s) => s.provider);
// With:
const providers = useChatStore((s) => s.providers);
const availableModels = getAvailableModels(providers);
const isConnected = availableModels.length > 0;

// Update handleSend to pass providerId:
const handleSend = useCallback(
  (content: string) => {
    if (isStreaming) return;
    if (!isPanelOpen) togglePanel();
    addUserMessage(content);
    startAssistantMessage();

    const systemPrompt = buildSystemPrompt();
    const providerId = getProviderFromModel(selectedModel);
    sendChatMessage(content, systemPrompt, providerId, sessionId ?? undefined, selectedModel);
  },
  [addUserMessage, startAssistantMessage, sessionId, isPanelOpen, togglePanel, isStreaming, selectedModel],
);

// Update handleStop to pass providerId:
const handleStop = useCallback(() => {
  const providerId = getProviderFromModel(selectedModel);
  stopChat(providerId);
}, [selectedModel]);

// Update initChat call:
useEffect(() => {
  if (isPanelOpen) {
    const providerId = getProviderFromModel(selectedModel);
    void initChat(providerId);
  }
}, [isPanelOpen, selectedModel]);

// Update model selector to use availableModels:
<select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={isStreaming}>
  {availableModels.map((m) => (
    <option key={m.id} value={m.id}>{m.displayName}</option>
  ))}
</select>
```

- [ ] **Step 2: Handle "Connect a provider" state**

When `availableModels.length === 0`, show a message like "Connect a provider in Settings to start" instead of the chat suggestions.

- [ ] **Step 3: Run lint + typecheck + test**

Run: `npm run lint && npm run typecheck && npm run test`

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatPanel/ChatPanel.tsx
git commit -m "feat: model selector shows models from connected providers"
```

---

### Task 10: CLAUDE.md + cleanup

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the following sections:
- **Architecture tree**: Rename `agent-runner.ts` → `agent-runner-claude.ts`, add `agent-runner-codex.ts`
- **Stack**: Add `@openai/codex-sdk`
- **Provider auth section**: Document multi-provider architecture, switch by model, independent connect/disconnect
- **Phase 4**: Mark Codex as done
- **Decisions**: Update "Auth provider" to describe multi-provider pattern

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for multi-provider architecture"
```

---

### Task 11: Integration test — Full flow verification

- [ ] **Step 1: Run all checks**

```bash
npm run lint
npm run typecheck
npm run test
cd src-tauri && cargo check && cargo clippy && cargo fmt --check
```

- [ ] **Step 2: Manual test checklist**

Run `npm run tauri dev` and verify:
- [ ] AgentSetupModal shows both Claude and Codex rows
- [ ] Claude connection via subscription works
- [ ] Claude connection via API key works
- [ ] Codex connection via API key works (if you have one)
- [ ] Model selector shows only models from connected providers
- [ ] Sending a message with a Claude model uses the Claude subprocess
- [ ] Sending a message with a GPT model uses the Codex subprocess
- [ ] Disconnect one provider doesn't affect the other
- [ ] Error handling works per-provider (credit balance, not logged in)

- [ ] **Step 3: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for multi-provider"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-25-multi-provider.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session, batch execution with checkpoints

Which approach?