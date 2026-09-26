import i18next from "../i18n";
import { PROVIDERS, type Provider, type ProviderId } from "../types/chat";

export function authErrorText(
  providerId: ProviderId,
  provider: Provider | undefined,
): string {
  const meta = PROVIDERS[providerId];
  if (provider?.loginType === "api-key") {
    return provider.apiKeyStored
      ? i18next.t("chatError.apiKeyRejected", { name: meta.name })
      : i18next.t("chatError.apiKeyMissing", { name: meta.name });
  }
  return i18next.t("chatError.notSignedIn", {
    cli: meta.cliName,
    command: meta.loginCommand,
  });
}

// Codes returned by chat_send when it refuses to start an agent.
export function chatSendErrorText(providerId: ProviderId, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const name = PROVIDERS[providerId].name;
  if (message === "api_key_missing") {
    return i18next.t("chatError.apiKeyMissing", { name });
  }
  if (message === "keyring_unavailable") {
    return i18next.t("chatError.keyringUnavailable", { name });
  }
  return message;
}
