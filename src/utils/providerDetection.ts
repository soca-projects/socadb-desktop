import { invoke } from "@tauri-apps/api/core";
import { checkChatStatus } from "./chatCommands";
import type { ChatStatusResult, ProviderId } from "../types/chat";

export interface ProviderStatus {
  installed: boolean;
  authenticated: boolean;
  email: string | null;
  loginType: string | null;
  failureReason: string | null;
}

interface FastDetectResult {
  installed: boolean;
  config_dir: string | null;
  auth_hint: string | null;
  email: string | null;
}

async function fastDetect(id: ProviderId): Promise<FastDetectResult | null> {
  try {
    return (await invoke("fast_detect_provider", { providerId: id })) as FastDetectResult;
  } catch {
    return null;
  }
}

const skipDetection =
  import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_DETECTION === "true";

export async function detectProvider(id: ProviderId): Promise<ProviderStatus> {
  if (skipDetection) {
    return {
      installed: false,
      authenticated: false,
      email: null,
      loginType: null,
      failureReason: "VITE_DEV_SKIP_DETECTION enabled",
    };
  }

  const fast = await fastDetect(id);

  try {
    const status: ChatStatusResult = await checkChatStatus(id);
    return {
      installed: true,
      authenticated: status.loggedIn,
      email: status.email ?? fast?.email ?? null,
      loginType: status.loginType,
      failureReason: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      installed: fast?.installed ?? false,
      authenticated: false,
      email: fast?.email ?? null,
      loginType: null,
      failureReason: message,
    };
  }
}

export interface DiagnoseStep {
  kind: "ok" | "warn" | "fail";
  label: string;
  detail?: string | null;
}

export interface DiagnoseReport {
  provider_id: ProviderId;
  success: boolean;
  steps: DiagnoseStep[];
}

export async function diagnoseProvider(id: ProviderId): Promise<DiagnoseReport> {
  return (await invoke("chat_diagnose", { providerId: id })) as DiagnoseReport;
}
