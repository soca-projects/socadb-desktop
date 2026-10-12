import { memo, useMemo } from "react";
import type { Schema } from "../../types/schema";
import { buildPreview, PREVIEW_METRICS } from "../../utils/schemaPreview";
import { getColorVariants } from "../../utils/tableColors";
import { useThemeStore } from "../../stores/themeStore";

const MONO = "IBM Plex Mono, ui-monospace, monospace";
const LINE = { vectorEffect: "non-scaling-stroke" } as const;

export const SchemaPreview = memo(function SchemaPreview({ schema }: { schema: Schema }) {
  const isDark = useThemeStore((s) => s.theme === "dark");
  const preview = useMemo(() => buildPreview(schema), [schema]);

  return (
    <svg
      viewBox={preview.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full pt-7"
      aria-hidden="true"
    >
      {preview.edges.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          strokeWidth={1}
          style={{ ...LINE, stroke: "var(--color-edge-default)" }}
        />
      ))}
      {preview.tables.map((table) => {
        const variants = table.color ? getColorVariants(table.color, isDark) : null;
        return (
          <g key={table.id}>
            <rect
              x={table.x}
              y={table.y}
              width={table.width}
              height={table.height}
              rx={8}
              style={{ fill: "var(--color-surface)" }}
            />
            <path
              d={table.headerPath}
              style={{ fill: variants?.bg ?? "var(--color-surface)" }}
            />
            <line
              x1={table.x}
              x2={table.x + table.width}
              y1={table.y + PREVIEW_METRICS.header}
              y2={table.y + PREVIEW_METRICS.header}
              strokeWidth={1}
              style={{ ...LINE, stroke: "var(--color-border)" }}
            />
            <rect
              x={table.x + 14}
              y={table.y + 13}
              width={14}
              height={14}
              rx={3}
              style={{ fill: variants?.dot ?? "var(--color-fg-tertiary)" }}
            />
            <text
              x={table.x + 36}
              y={table.y + 20}
              dominantBaseline="central"
              fontFamily={MONO}
              fontSize={13}
              fontWeight={600}
              style={{ fill: "var(--color-fg)" }}
            >
              {table.name}
            </text>
            {table.columns.map((column) => (
              <g key={column.id}>
                {column.key && (
                  <circle
                    cx={table.x + 22}
                    cy={column.y}
                    r={3.5}
                    style={{
                      fill:
                        column.key === "primary"
                          ? "var(--color-badge-primary-text)"
                          : "var(--color-badge-unique-text)",
                    }}
                  />
                )}
                <text
                  x={table.x + 38}
                  y={column.y}
                  dominantBaseline="central"
                  fontFamily={MONO}
                  fontSize={12}
                  style={{ fill: "var(--color-fg-secondary)" }}
                >
                  {column.name}
                </text>
                <text
                  x={table.x + table.width - 14}
                  y={column.y}
                  dominantBaseline="central"
                  textAnchor="end"
                  fontFamily={MONO}
                  fontSize={11}
                  style={{ fill: "var(--color-fg-tertiary)" }}
                >
                  {column.type}
                </text>
              </g>
            ))}
            <rect
              x={table.x}
              y={table.y}
              width={table.width}
              height={table.height}
              rx={8}
              fill="none"
              strokeWidth={1}
              style={{ ...LINE, stroke: "var(--color-border)" }}
            />
          </g>
        );
      })}
    </svg>
  );
});
