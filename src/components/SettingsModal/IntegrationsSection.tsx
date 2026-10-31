import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckIcon as Check, InfoIcon as Info } from "@phosphor-icons/react";
import { ClaudeIcon } from "../../assets/icons/ClaudeIcon";
import { CodexIcon } from "../../assets/icons/CodexIcon";
import { CopyableCommand } from "./CopyableCommand";
import { DisclosureRow, SettingsGroup, Switch } from "./SettingsRow";
import { toMessage } from "../../utils/errorMessage";
import { logError } from "../../utils/log";
import {
  CLIENT_NAMES,
  configErrorForLog,
  getIntegrationStatuses,
  getMcpServerPath,
  setIntegrationEnabled,
  type IntegrationId,
  type IntegrationStatus,
} from "../../utils/mcpRegistration";

const CLIENTS: Record<
  IntegrationId,
  { name: string; Icon: typeof ClaudeIcon; tile: string; needsRestart: boolean }
> = {
  claudeCode: {
    name: CLIENT_NAMES.claudeCode,
    Icon: ClaudeIcon,
    tile: "bg-[#D97757]/10",
    needsRestart: false,
  },
  claudeDesktop: {
    name: CLIENT_NAMES.claudeDesktop,
    Icon: ClaudeIcon,
    tile: "bg-[#D97757]/10",
    needsRestart: true,
  },
  codex: {
    name: CLIENT_NAMES.codex,
    Icon: CodexIcon,
    tile: "bg-stone-500/10 dark:bg-stone-400/10",
    needsRestart: false,
  },
};

type Tone = "ok" | "note" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-secondary",
  note: "text-secondary",
  muted: "text-tertiary",
};

function IntegrationRow({
  status,
  changed,
  busy,
  onToggle,
}: {
  status: IntegrationStatus;
  changed: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const statusId = useId();
  const client = CLIENTS[status.id];

  let tone: Tone;
  let text: string;
  if (!status.installed) {
    [tone, text] = ["muted", t("integrations.notInstalled")];
  } else if (status.unreadable) {
    [tone, text] = ["note", t("integrations.unreadable")];
  } else if (status.removed) {
    [tone, text] = ["note", t("integrations.removed", { name: client.name })];
  } else if ((changed || status.pending) && client.needsRestart) {
    [tone, text] = [
      "note",
      t(status.enabled ? "integrations.restartToAdd" : "integrations.restartToRemove", {
        name: client.name,
      }),
    ];
  } else if (!status.enabled) {
    [tone, text] = ["muted", t("integrations.off")];
  } else {
    [tone, text] = [
      "ok",
      t(client.needsRestart ? "integrations.on" : "integrations.availableInNewSessions"),
    ];
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${client.tile}`}
      >
        <client.Icon size={16} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          id={nameId}
          className={`text-[13px] font-medium ${status.installed ? "text-secondary" : "text-tertiary"}`}
        >
          {client.name}
        </span>
        <span
          id={statusId}
          className={`flex items-start gap-1.5 text-[11.5px] leading-snug ${TONE_CLASS[tone]}`}
        >
          {tone === "ok" && (
            <Check
              size={12}
              weight="bold"
              className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400"
            />
          )}
          {tone === "note" && <Info size={12} className="mt-px shrink-0" />}
          <span>{text}</span>
        </span>
      </div>
      <Switch
        checked={status.enabled}
        disabled={!status.installed || status.unreadable || busy}
        onClick={onToggle}
        labelledBy={nameId}
        describedBy={statusId}
      />
    </div>
  );
}

export function IntegrationsSection() {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState<IntegrationStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<Partial<Record<IntegrationId, boolean>>>({});
  const [serverPath, setServerPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatuses(await getIntegrationStatuses());
  }, []);

  useEffect(() => {
    void getIntegrationStatuses().then(setStatuses);
    getMcpServerPath().then(setServerPath, () => setServerPath(null));
  }, []);

  const toggle = useCallback(
    async (status: IntegrationStatus) => {
      setBusy(true);
      try {
        await setIntegrationEnabled(status.id, !status.enabled);
        setChanged((c) => ({ ...c, [status.id]: true }));
      } catch (error) {
        logError("mcp.integration.toggle_failed", configErrorForLog(error), {
          client: status.id,
        });
        toast.error(
          t("integrations.failed", {
            name: CLIENTS[status.id].name,
            error: toMessage(error),
          }),
        );
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [refresh, t],
  );

  return (
    <div className="space-y-4">
      <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-tertiary">
        {t("integrations.description")}
      </p>

      {statuses && (
        <SettingsGroup>
          {statuses.map((status) => (
            <IntegrationRow
              key={status.id}
              status={status}
              changed={changed[status.id] ?? false}
              busy={busy}
              onToggle={() => void toggle(status)}
            />
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup>
        <DisclosureRow label={t("integrations.howTo")}>
          <ol className="list-decimal space-y-2 pl-4 text-[12px] leading-relaxed text-secondary">
            <li>{t("integrations.howToOpen")}</li>
            <li>
              {t("integrations.howToAsk")}
              <p className="mt-1.5 select-text rounded-md bg-surface-muted px-3 py-1.5 font-mono text-[11px] text-tertiary">
                {t("integrations.howToExample")}
              </p>
            </li>
            <li>{t("integrations.howToAllow")}</li>
          </ol>
        </DisclosureRow>
        <DisclosureRow label={t("integrations.otherApp")}>
          <p className="text-[12px] leading-relaxed text-secondary">
            {t("integrations.otherAppHint")}
          </p>
          {serverPath && <CopyableCommand>{serverPath}</CopyableCommand>}
        </DisclosureRow>
      </SettingsGroup>
    </div>
  );
}
