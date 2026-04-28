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
  configDir: string | null;
  authHint: string | null;
  email: string | null;
}

async function fastDetect(id: ProviderId): Promise<FastDetectResult | null> {
  try {
    return await invoke<FastDetectResult>("fast_detect_provider", { providerId: id });
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

  // Both calls are independent state reads; run them in parallel so the slower
  // chat_status spawn doesn't block on the cheap filesystem-only fast-path.
  const [fastResult, statusResult] = await Promise.allSettled([
    fastDetect(id),
    checkChatStatus(id),
  ]);

  const fast = fastResult.status === "fulfilled" ? fastResult.value : null;

  if (statusResult.status === "fulfilled") {
    const status: ChatStatusResult = statusResult.value;
    return {
      installed: true,
      authenticated: status.loggedIn,
      email: status.email ?? fast?.email ?? null,
      loginType: status.loginType,
      failureReason: null,
    };
  }

  const reason = statusResult.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    installed: fast?.installed ?? false,
    authenticated: false,
    email: fast?.email ?? null,
    loginType: null,
    failureReason: message,
  };
}

export interface DiagnoseStep {
  kind: "ok" | "warn" | "fail";
  label: string;
  detail?: string | null;
}

export interface DiagnoseReport {
  providerId: ProviderId;
  success: boolean;
  steps: DiagnoseStep[];
}

export async function diagnoseProvider(id: ProviderId): Promise<DiagnoseReport> {
  return await invoke<DiagnoseReport>("chat_diagnose", { providerId: id });
}
