import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { PickMenu, type PickGroup } from "../PickMenu/PickMenu";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectMenuProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  className: string;
  ariaLabel?: string;
  disabled?: boolean;
  caretSize?: number;
  menuWidth?: number;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
  disabled,
  caretSize = 11,
  menuWidth = 0,
}: SelectMenuProps<T>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  if (disabled && anchor) setAnchor(null);
  const close = useCallback(() => setAnchor(null), []);
  const groups = useMemo<PickGroup[]>(
    () => [{ items: options.map(({ value: v, label }) => ({ value: v, label })) }],
    [options],
  );
  const getGroups = useCallback(() => groups, [groups]);
  const current = options.find((o) => o.value === value);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (anchor || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    setAnchor(e.currentTarget);
  };

  return (
    <>
      <button
        type="button"
        // WebKit leaves buttons out of the Tab order unless full keyboard
        // access is on; the select this replaces was in it.
        tabIndex={0}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        onKeyDown={handleKeyDown}
        className={`nokey flex items-center justify-between gap-1.5 text-left ${className}`}
      >
        {ariaLabel && <span className="sr-only">{ariaLabel}, </span>}
        <span className="truncate">{current?.label ?? value}</span>
        <CaretDown size={caretSize} className="shrink-0 text-tertiary" />
      </button>
      {anchor && (
        <PickMenu
          anchor={anchor}
          value={value}
          getGroups={getGroups}
          width={menuWidth}
          font="sans"
          label={ariaLabel}
          onPick={(picked) => {
            const option = options.find((o) => o.value === picked);
            if (option && option.value !== value) onChange(option.value);
          }}
          onClose={close}
        />
      )}
    </>
  );
}
