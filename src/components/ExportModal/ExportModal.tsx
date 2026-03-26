import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  XIcon as X,
  FileImageIcon as FileImage,
  BracketsCurlyIcon as BracketsCurly,
} from "@phosphor-icons/react";
import { PostgresqlIcon } from "../../assets/icons/PostgresqlIcon";
import { MysqlIcon } from "../../assets/icons/MysqlIcon";
import { useSchemaStore } from "../../stores/schemaStore";
import { exportCanvasPng } from "../../utils/exportPng";
import { exportCanvasSvg } from "../../utils/exportSvg";
import { exportSql } from "../../utils/exportSql";
import { exportJson } from "../../utils/exportJson";

type ExportType = "sql" | "image" | "json";
type ImageFormat = "png" | "svg";

interface ExportModalProps {
  onClose: () => void;
}

export function ExportModal({ onClose }: ExportModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ExportType>("sql");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const dbType = useSchemaStore((s) => s.schema.dbType);

  const handleExport = () => {
    switch (selected) {
      case "sql":
        void exportSql();
        break;
      case "image":
        if (imageFormat === "png") void exportCanvasPng();
        else void exportCanvasSvg();
        break;
      case "json":
        void exportJson();
        break;
    }
    onClose();
  };

  const cards: {
    type: ExportType;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      type: "sql",
      label: dbType === "mysql" ? t("toolbar.mysql") : t("toolbar.postgresql"),
      description: t("export.sqlDescription"),
      icon: dbType === "mysql" ? <MysqlIcon size={24} /> : <PostgresqlIcon size={24} />,
    },
    {
      type: "image",
      label: t("export.imageLabel"),
      description: t("export.imageDescription"),
      icon: <FileImage size={24} />,
    },
    {
      type: "json",
      label: t("export.jsonLabel"),
      description: t("export.jsonDescription"),
      icon: <BracketsCurly size={24} />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="export-title"
        className="w-full max-w-[480px] rounded-xl border border-border bg-surface p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="export-title" className="text-base font-semibold text-primary">
              {t("export.title")}
            </h2>
            <p className="mt-1 text-[13px] text-tertiary">{t("export.description")}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
            aria-label={t("export.close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {cards.map((card) => (
            <button
              key={card.type}
              onClick={() => setSelected(card.type)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${
                selected === card.type
                  ? "border-accent bg-accent/[0.05] text-accent"
                  : "border-border text-tertiary hover:border-border-hover hover:text-secondary"
              }`}
            >
              {card.icon}
              <span className="text-[13px] font-medium">{card.label}</span>
              <span className="text-[11px] leading-tight text-tertiary">
                {card.description}
              </span>
            </button>
          ))}
        </div>

        {selected === "image" && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-muted p-1">
            {(["png", "svg"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setImageFormat(fmt)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  imageFormat === fmt
                    ? "bg-surface text-accent shadow-soft"
                    : "text-tertiary hover:text-secondary"
                }`}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleExport}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
          >
            {t("export.exportButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
