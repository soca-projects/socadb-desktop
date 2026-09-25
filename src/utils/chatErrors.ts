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
