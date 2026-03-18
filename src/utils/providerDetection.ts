import { invoke } from "@tauri-apps/api/core";

interface ProviderStatus {
  installed: boolean;
  authenticated: boolean;
  email: string | null;
}

export async function detectClaudeCode(): Promise<ProviderStatus> {
  try {
    return await invoke<ProviderStatus>("detect_provider");
  } catch {
    return { installed: false, authenticated: false, email: null };
  }
}
