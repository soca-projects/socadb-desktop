import { Trans, useTranslation } from "react-i18next";
import {
  DraftTableSketch,
  ImportFileSketch,
  NewSchemaSketch,
  OpenFileSketch,
} from "../Sketch/Sketch";

interface HomeEmptyProps {
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
}

const CARD =
  "flex flex-col items-start gap-2 rounded-lg bg-surface p-4 text-left transition-colors hover:bg-surface-paper-muted";
const ACTION = `${CARD} border border-border hover:border-border-hover`;
const MAIN_ACTION = `${CARD} border-2 border-sticker shadow-sticker dark:border dark:border-border dark:hover:border-border-hover`;
const CARD_SKETCH = "mb-1 h-10 w-[54px]";

export function HomeEmpty({ onNew, onOpen, onImport }: HomeEmptyProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-10 flex max-w-[640px] flex-col items-center gap-2.5 text-center">
      <DraftTableSketch className="mb-3 w-[250px]" />
      <h2 className="text-[22px] font-bold tracking-[-0.02em] text-primary">
        <Trans
          i18nKey="home.empty.title"
          components={{ mark: <span className="marker" /> }}
        />
      </h2>
      <p className="max-w-[460px] text-[13.5px] leading-normal text-tertiary">
        {t("home.empty.description")}
      </p>
      <div className="mt-4 grid w-full grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <button type="button" onClick={onNew} className={MAIN_ACTION}>
          <NewSchemaSketch className={CARD_SKETCH} />
          <span className="text-[13.5px] font-medium text-primary">{t("home.new")}</span>
          <span className="text-[12px] leading-snug text-tertiary">
            {t("home.empty.newHint")}
          </span>
        </button>
        <button type="button" onClick={onOpen} className={ACTION}>
          <OpenFileSketch className={CARD_SKETCH} />
          <span className="text-[13.5px] font-medium text-primary">
            {t("home.empty.open")}
          </span>
          <span className="text-[12px] leading-snug text-tertiary">
            {t("home.empty.openHint")}
          </span>
        </button>
        <button type="button" onClick={onImport} className={ACTION}>
          <ImportFileSketch className={CARD_SKETCH} />
          <span className="text-[13.5px] font-medium text-primary">
            {t("home.empty.import")}
          </span>
          <span className="text-[12px] leading-snug text-tertiary">
            {t("home.empty.importHint")}
          </span>
        </button>
      </div>
    </div>
  );
}
