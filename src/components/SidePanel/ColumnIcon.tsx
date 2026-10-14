import {
  HashIcon as Hash,
  KeyIcon as Key,
  LinkIcon as Link,
} from "@phosphor-icons/react";
import type { Column } from "../../types/schema";

export function ColumnIcon({ column }: { column: Column }) {
  return (
    <span className="flex w-3.5 shrink-0 items-center justify-center">
      {column.isPrimaryKey ? (
        <Key size={13} weight="fill" className="text-badge-primary" />
      ) : column.isForeignKey ? (
        <Link size={13} weight="bold" className="text-badge-unique" />
      ) : (
        <Hash size={13} className="text-muted" />
      )}
    </span>
  );
}
