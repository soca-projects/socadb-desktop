import { useTranslation } from "react-i18next";
import { FileIcon as File } from "@phosphor-icons/react";
import { fileNameOf } from "../../utils/importFiles";
import type { DbType } from "../../types/schema";

const DB_TYPES: DbType[] = ["mysql", "postgresql"];
const DB_LABEL: Record<DbType, string> = { mysql: "MySQL", postgresql: "PostgreSQL" };

interface DialectRowsProps {
  paths: string[];
  dbOf: (path: string) => DbType;
  onPick: (path: string, dbType: DbType) => void;
  onPickAll: (dbType: DbType) => void;
}

export function DialectRows({ paths, dbOf, onPick, onPickAll }: DialectRowsProps) {
  const { t } = useTranslation();
  return (
    <>
      {paths.length > 1 && (
        <div className="flex shrink-0 gap-2">
          {DB_TYPES.map((dbType) => (
            <button
              key={dbType}
              type="button"
              onClick={() => onPickAll(dbType)}
              className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted"
            >
              {t(dbType === "mysql" ? "importFlow.allMysql" : "importFlow.allPostgresql")}
            </button>
          ))}
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
        {paths.map((path, i) => {
          const name = fileNameOf(path);
          return (
            <li
              key={path}
              className={`flex items-center gap-2.5 py-2.5 pl-3 pr-2.5 ${
                i > 0 ? "border-t border-border-light" : ""
              }`}
            >
              <File size={16} className="shrink-0 text-tertiary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-primary">
                {name}
              </span>
              <div
                role="radiogroup"
                aria-label={t("importFlow.fileDatabase", { name })}
                className="flex shrink-0 rounded-lg border border-border bg-surface-muted p-0.5"
              >
                {DB_TYPES.map((dbType) => (
                  <button
                    key={dbType}
                    type="button"
                    role="radio"
                    aria-checked={dbOf(path) === dbType}
                    onClick={() => onPick(path, dbType)}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                      dbOf(path) === dbType
                        ? "bg-surface text-accent shadow-soft"
                        : "text-tertiary hover:text-secondary"
                    }`}
                  >
                    {DB_LABEL[dbType]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
