import { Trans, useTranslation } from "react-i18next";
import { PlusIcon as Plus, ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react";
import { ArrowSketch, DraftTableSketch } from "../Sketch/Sketch";
import { useChatStore } from "../../stores/chatStore";

interface EmptyCanvasProps {
  onAddTable: () => void;
  isSidePanelOpen: boolean;
}

const CHAT_GUTTER_PX = 32;
const MIN_CONTENT_PX = 280;

export function EmptyCanvas({ onAddTable, isSidePanelOpen }: EmptyCanvasProps) {
  const { t } = useTranslation();
  const chatOpen = useChatStore((s) => s.isPanelOpen);
  const chatWidth = useChatStore((s) => s.panelSize.width);
  const chatInset = chatOpen ? chatWidth + CHAT_GUTTER_PX : 0;

  // The canvas controls and the chat float over the canvas: the content keeps
  // clear of them, and drops the drawing when the window is too short.
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center pb-20"
      style={{
        paddingRight: `min(${chatInset}px, max(0px, 100% - ${MIN_CONTENT_PX}px))`,
      }}
    >
      <div className="pointer-events-auto flex w-full max-w-[372px] flex-col items-center px-4 text-center">
        <DraftTableSketch
          className="w-[210px] animate-fade-in [@media(max-height:640px)]:hidden"
          style={{ animationDelay: "0.05s" }}
        />

        <h3
          className="mt-5 text-[20px] font-bold tracking-[-0.02em] text-primary animate-fade-in"
          style={{ animationDelay: "0.12s" }}
        >
          <Trans
            i18nKey="emptyCanvas.heading"
            components={{ mark: <span className="marker" /> }}
          />
        </h3>
        <p
          className="mt-1.5 text-[13px] leading-relaxed text-tertiary animate-fade-in"
          style={{ animationDelay: "0.18s" }}
        >
          {t("emptyCanvas.description")}
        </p>

        <div
          className="mt-5 flex flex-col items-center animate-fade-in"
          style={{ animationDelay: "0.25s" }}
        >
          <button
            onClick={onAddTable}
            className="flex items-center gap-2 rounded-lg border-2 border-sticker shadow-sticker bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
          >
            <Plus size={15} weight="bold" />
            {t("emptyCanvas.createFirst")}
          </button>
          <span className="relative mt-2 whitespace-nowrap text-[13px] text-tertiary">
            {t("emptyCanvas.askAi")}
            <ArrowSketch className="absolute left-full top-2 ml-1 h-[30px] w-[62px]" />
          </span>
        </div>

        {!isSidePanelOpen && (
          <p
            className="mt-4 flex items-center gap-1 text-[12px] text-tertiary animate-fade-in"
            style={{ animationDelay: "0.4s" }}
          >
            <ArrowLeft size={10} />
            {t("emptyCanvas.openSidePanel")}
          </p>
        )}
      </div>
    </div>
  );
}
