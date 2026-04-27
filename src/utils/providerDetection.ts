import { checkChatStatus } from "./chatCommands";
import type { ChatStatusResult, ProviderId } from "../types/chat";

export interface ProviderStatus {
  installed: boolean;
  authenticated: boolean;
  email: string | null;
  loginType: string | null;
}

const skipDetection =
  import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_DETECTION === "true";

export async function detectProvider(id: ProviderId): Promise<ProviderStatus> {
  if (skipDetection) {
    return { installed: false, authenticated: false, email: null, loginType: null };
  }
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
