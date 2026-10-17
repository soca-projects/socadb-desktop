import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

const INK = "fill-surface stroke-[var(--color-fg)]";
const ROSE = "stroke-accent dark:stroke-accent-hover";
const GHOST = "stroke-border-hover";

interface SketchProps {
  className?: string;
  style?: CSSProperties;
}

function Pencil({
  x,
  y,
  angle,
  scale = 1,
}: {
  x: number;
  y: number;
  angle: number;
  scale?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}
      strokeWidth={1.8 / scale}
    >
      <rect className={INK} x={-58} y={-8} width={58} height={16} rx={3} />
      <path className={`${INK} [stroke-linejoin:round]`} d="M-58 -8 L-76 0 L-58 8 Z" />
      <path className="fill-[var(--color-fg)]" d="M-70 -3 L-76 0 L-70 3 Z" />
      <rect className={INK} x={-4} y={-8} width={12} height={16} rx={2} />
    </g>
  );
}

export function DraftTableSketch({ className, style }: SketchProps) {
  const { t } = useTranslation();
  return (
    <svg viewBox="-4 -4 284 196" className={className} style={style} aria-hidden="true">
      <g strokeWidth={2} strokeDasharray="9 8">
        <rect
          className={`fill-surface ${ROSE}`}
          x={0}
          y={0}
          width={180}
          height={150}
          rx={12}
        />
        <line className={ROSE} x1={0} y1={40} x2={180} y2={40} />
      </g>
      <text
        className="fill-accent font-mono text-[14px] font-semibold dark:fill-accent-hover"
        x={16}
        y={25}
      >
        {t("sketch.draftTable")}
      </text>
      <g className={GHOST} strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round">
        <line x1={16} y1={74} x2={130} y2={74} />
        <line x1={16} y1={102} x2={104} y2={102} />
        <line x1={16} y1={130} x2={70} y2={130} />
      </g>
      <Pencil x={262} y={168} angle={-12} />
    </svg>
  );
}

export function NewSchemaSketch({ className }: SketchProps) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <g strokeWidth={2} strokeDasharray="5 4">
        <rect
          className={`fill-surface ${ROSE}`}
          x={6}
          y={8}
          width={34}
          height={30}
          rx={5}
        />
        <line className={ROSE} x1={6} y1={17} x2={40} y2={17} />
      </g>
      <Pencil x={60} y={25} angle={-35} scale={0.35} />
    </svg>
  );
}

export function OpenFileSketch({ className }: SketchProps) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <g strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path className={INK} d="M18 4 h20 l10 10 v30 h-30 Z" />
        <path className="fill-accent/30 stroke-none" d="M19 16 h28 v7 h-28 Z" />
        <path
          className="fill-none stroke-[var(--color-fg)]"
          d="M38 4 v10 h10 M24 30 h18 M24 37 h12"
        />
      </g>
    </svg>
  );
}

export function ImportFileSketch({ className }: SketchProps) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <g strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path className={INK} d="M14 4 h20 l10 10 v30 h-30 Z" />
        <path className="fill-none stroke-[var(--color-fg)]" d="M34 4 v10 h10" />
        <path className={`fill-none ${ROSE}`} d="M54 16 v20 M48 30 l6 6 l6 -6" />
      </g>
      <text
        className="fill-[var(--color-fg)] font-mono text-[10px] font-bold"
        x={18}
        y={31}
      >
        SQL
      </text>
    </svg>
  );
}

export function GhostTableSketch({ className }: SketchProps) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <g
        className={`fill-none ${GHOST}`}
        strokeWidth={2}
        strokeDasharray="6 6"
        strokeLinecap="round"
      >
        <rect x={8} y={6} width={48} height={36} rx={6} />
        <line x1={8} y1={17} x2={56} y2={17} />
      </g>
    </svg>
  );
}

export function ArrowSketch({ className }: SketchProps) {
  return (
    <svg viewBox="0 0 90 44" className={className} aria-hidden="true">
      <path
        className="fill-none stroke-[var(--color-fg)]"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12 C 28 4, 60 10, 80 32 M77.5 20 L80 32 L68.5 28.5"
      />
    </svg>
  );
}
