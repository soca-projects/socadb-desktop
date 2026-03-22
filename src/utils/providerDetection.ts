import { checkChatStatus } from "../hooks/useChatStream";
import type { ChatStatusResult } from "../types/chat";

export interface ProviderStatus {
  installed: boolean;
  authenticated: boolean;
  email: string | null;
  loginType: string | null;
}

export async function detectClaudeCode(): Promise<ProviderStatus> {
  try {
    const status: ChatStatusResult = await checkChatStatus();
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
