import { useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon as X } from "@phosphor-icons/react";
import { addValues } from "../../utils/enumHelpers";

const SHOWN = 4;

interface EnumValuesProps {
  values: string[];
  autoFocus?: boolean;
  onChange: (values: string[]) => void;
}

export function EnumValues({ values, autoFocus, onChange }: EnumValuesProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const long = values.length > SHOWN;
  const shown = long && !expanded ? values.slice(0, SHOWN) : values;

  const add = (raw: string) => {
    const next = addValues(values, raw);
    if (next.length !== values.length) onChange(next);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-0.5 rounded-[4px] border border-border bg-surface py-px pl-1.5 pr-0.5 font-mono text-[11px] leading-[1.5] text-secondary"
        >
          {value}
          <button
            type="button"
            onClick={() => onChange(values.filter((v) => v !== value))}
            aria-label={t("sidePanel.removeValue", { value })}
            className="grid h-3.5 w-3.5 place-items-center rounded-[3px] text-muted hover:bg-surface-muted hover:text-secondary"
          >
            <X size={9} weight="bold" />
          </button>
        </span>
      ))}
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="rounded-[4px] bg-surface-muted px-1.5 py-px font-mono text-[11px] leading-[1.5] text-tertiary hover:text-primary"
        >
          {expanded
            ? t("sidePanel.showLess")
            : t("sidePanel.moreValues", { count: values.length - SHOWN })}
        </button>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          add(draft);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (!/[,\n\r\t]/.test(text)) return;
          e.preventDefault();
          add(text);
        }}
        autoFocus={autoFocus}
        placeholder={t("sidePanel.addValue")}
        title={t("sidePanel.addValueHint")}
        spellCheck={false}
        className="h-5 w-[86px] rounded-[4px] border border-dashed border-border-hover bg-transparent px-1 font-mono text-[11px] text-secondary outline-none placeholder:text-tertiary focus:border-solid focus:border-accent/45"
      />
    </div>
  );
}
