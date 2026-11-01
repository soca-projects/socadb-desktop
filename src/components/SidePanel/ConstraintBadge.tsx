const BADGE_INACTIVE =
  "bg-transparent text-tertiary border-transparent hover:bg-surface-muted hover:text-tertiary";
const BADGE_ACTIVE = {
  default: "bg-accent/10 text-accent border-accent/20",
  amber: "bg-badge-primary-bg text-badge-primary border-badge-primary-border",
  blue: "bg-badge-unique-bg text-badge-unique border-badge-unique-border",
} as const;

export function ConstraintBadge({
  label,
  active,
  disabled,
  onClick,
  variant = "default",
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "amber" | "blue";
}) {
  const colorClass = active ? BADGE_ACTIVE[variant] : BADGE_INACTIVE;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center rounded-[4px] border px-[5px] py-[1px] font-mono text-[11px] font-medium leading-tight transition-all ${colorClass} ${disabled ? "cursor-not-allowed opacity-30" : ""}`}
    >
      {label}
    </button>
  );
}
