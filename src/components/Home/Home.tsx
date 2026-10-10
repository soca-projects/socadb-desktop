import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDownIcon as CaretDown,
  DownloadSimpleIcon as DownloadSimple,
  FolderOpenIcon as FolderOpen,
  MagnifyingGlassIcon as MagnifyingGlass,
  PlusIcon as Plus,
  XIcon as X,
} from "@phosphor-icons/react";
import { Toolbar } from "../Toolbar/Toolbar";
import { ImportModal } from "../ImportModal/ImportModal";
import { HomeCard } from "./HomeCard";
import type { HomeMenuItem } from "./HomeCardMenu";
import { HomeEmpty } from "./HomeEmpty";
import { MissingFiles } from "./MissingFiles";
import { RenameSchemaModal } from "./RenameSchemaModal";
import { DeleteDraftModal } from "./DeleteDraftModal";
import { useHomeEntries } from "../../hooks/useHomeEntries";
import { useSchemaStore } from "../../stores/schemaStore";
import { useViewStore } from "../../stores/viewStore";
import {
  currentBadge,
  groupEntries,
  matchesEntry,
  nextCardIndex,
  relativeTime,
  sortEntries,
  splitSchemaPath,
  type HomeEntry,
} from "../../utils/homeList";
import {
  duplicateHomeEntry,
  getHomeSort,
  locateHomeEntry,
  openHomeEntry,
  removeHomeEntries,
  renameHomeEntry,
  resumeCurrentSchema,
  revealHomeEntry,
  setHomeSort,
} from "../../utils/homeActions";
import {
  handleHomeImport,
  handleNew,
  handleOpen,
  handleSaveAs,
} from "../../utils/menuActions";
import { IS_MAC, IS_WINDOWS } from "../../utils/platform";
import { closeSchema } from "../../utils/schemaActions";
import { isWorthResuming } from "../../utils/schemaQueries";
import { HomeSortZ } from "../../utils/zodSchemas";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4";
const GROUP_LABEL =
  "mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-tertiary";
const SECONDARY =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-muted";
const REVEAL_KEY = IS_MAC
  ? "home.action.revealMac"
  : IS_WINDOWS
    ? "home.action.revealWindows"
    : "home.action.revealLinux";

function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
  const cards = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("[data-home-card]"),
  );
  const index = cards.findIndex((card) => card === document.activeElement);
  if (index === -1) return;
  const columns = getComputedStyle(e.currentTarget).gridTemplateColumns.split(" ").length;
  const next = nextCardIndex(index, e.key, columns, cards.length);
  if (next === null) return;
  e.preventDefault();
  cards[next].focus();
}

interface HomeProps {
  onOpenSettings: () => void;
}

export function Home({ onOpenSettings }: HomeProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const entries = useHomeEntries();
  const schema = useSchemaStore((s) => s.schema);
  const filePath = useSchemaStore((s) => s.filePath);
  const dirty = useSchemaStore((s) => s.savedAt !== s.schema.updatedAt);
  const searchRequested = useViewStore((s) => s.searchRequested);
  const importOpen = useViewStore((s) => s.importOpen);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(getHomeSort);
  const [renaming, setRenaming] = useState<HomeEntry | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeImport = useViewStore((s) => s.closeImport);

  useEffect(() => {
    if (!searchRequested) return;
    searchRef.current?.focus();
    useViewStore.getState().searchHandled();
  }, [searchRequested]);

  const now = new Date();
  const list = entries ?? [];

  const when = (time: number | null, kind: "opened" | "modified") =>
    time === null
      ? null
      : t(kind === "opened" ? "home.opened" : "home.modified", {
          when: relativeTime(time, now, locale) ?? t("home.justNow"),
        });
  const meta = (tables: number | null, whenText: string | null) =>
    [tables === null ? null : t("home.tables", { count: tables }), whenText]
      .filter(Boolean)
      .join(" · ");

  const entryMenu = (entry: HomeEntry, isCurrent: boolean): HomeMenuItem[] => [
    { label: t("home.action.open"), onSelect: () => openHomeEntry(entry.path) },
    { label: t(REVEAL_KEY), onSelect: () => void revealHomeEntry(entry.path) },
    { label: t("home.action.rename"), onSelect: () => setRenaming(entry) },
    {
      label: t("home.action.duplicate"),
      onSelect: () => void duplicateHomeEntry(entry.path),
    },
    ...(isCurrent
      ? []
      : [
          {
            label: t("home.action.remove"),
            hint: t("home.action.removeHint"),
            separatorBefore: true,
            onSelect: () => removeHomeEntries([entry.path]),
          },
        ]),
  ];

  const current = isWorthResuming(schema, filePath)
    ? (() => {
        const badge = currentBadge(filePath, dirty);
        const entry: HomeEntry | null = filePath
          ? (list.find((e) => e.path === filePath) ?? {
              path: filePath,
              ...splitSchemaPath(filePath),
              openedAt: Date.parse(schema.updatedAt),
              modifiedAt: null,
              exists: true,
              schema,
            })
          : null;
        return {
          badge,
          entry,
          name: entry?.name ?? schema.name,
          folder: entry?.folder ?? t("home.neverSaved"),
        };
      })()
    : null;
  const showCurrent =
    current !== null &&
    matchesEntry({ name: current.name, folder: current.folder, schema }, query);

  const present = list.filter((e) => e.exists && e.path !== filePath);
  const missing = list.filter((e) => !e.exists);
  const groups = groupEntries(
    sortEntries(
      present.filter((e) => matchesEntry(e, query)),
      sort,
    ),
    sort,
    now,
  );
  const isEmpty = entries !== null && present.length === 0 && current === null;
  const noResults = query.trim() !== "" && groups.length === 0 && !showCurrent;

  const renderEntry = (entry: HomeEntry) => (
    <HomeCard
      key={entry.path}
      name={entry.name}
      folder={entry.folder}
      meta={meta(
        entry.schema?.tables.length ?? null,
        sort === "modified"
          ? when(entry.modifiedAt, "modified")
          : when(entry.openedAt, "opened"),
      )}
      schema={entry.schema}
      dbType={entry.schema?.dbType ?? null}
      badge={entry.schema ? null : { label: t("home.badge.unreadable"), tone: "muted" }}
      openLabel={t("home.card.open", { name: entry.name })}
      menuLabel={t("home.card.actions", { name: entry.name })}
      menuItems={entryMenu(entry, false)}
      onOpen={() => openHomeEntry(entry.path)}
    />
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-surface">
      <Toolbar variant="home" onOpenSettings={onOpenSettings} />

      <div className="flex shrink-0 flex-col gap-3.5 px-8 pb-3.5 pt-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-primary">
            {t("home.title")}
          </h1>
          {!isEmpty && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleNew}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
              >
                <Plus size={14} />
                {t("home.new")}
              </button>
              <button type="button" onClick={handleOpen} className={SECONDARY}>
                <FolderOpen size={14} />
                {t("home.open")}
              </button>
              <button type="button" onClick={handleHomeImport} className={SECONDARY}>
                <DownloadSimple size={14} />
                {t("home.import")}
              </button>
            </div>
          )}
        </div>
        {!isEmpty && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[220px] max-w-[380px] flex-1">
              <MagnifyingGlass
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                aria-label={t("home.searchLabel")}
                placeholder={t("home.searchPlaceholder")}
                spellCheck={false}
                className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-8 text-[13px] text-primary outline-none transition-colors placeholder:text-tertiary focus:border-accent/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("home.clearSearch")}
                  className="absolute right-1.5 top-1/2 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-md bg-surface-muted text-tertiary transition-colors hover:text-secondary"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-tertiary">
              {t("home.sortLabel")}
              <span className="relative inline-flex">
                <select
                  value={sort}
                  onChange={(e) => {
                    const next = HomeSortZ.parse(e.target.value);
                    setSort(next);
                    setHomeSort(next);
                  }}
                  className="h-[30px] appearance-none rounded-md border border-border bg-surface pl-2.5 pr-7 text-[12.5px] font-medium text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent"
                >
                  <option value="opened">{t("home.sort.opened")}</option>
                  <option value="modified">{t("home.sort.modified")}</option>
                  <option value="name">{t("home.sort.name")}</option>
                </select>
                <CaretDown
                  size={12}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-tertiary"
                />
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-1">
        {isEmpty && (
          <HomeEmpty onNew={handleNew} onOpen={handleOpen} onImport={handleHomeImport} />
        )}

        {showCurrent && current && (
          <section>
            <h2 className={`${GROUP_LABEL} mt-1.5`}>{t("home.resume")}</h2>
            <div className={GRID}>
              <HomeCard
                name={current.name}
                folder={current.folder}
                meta={meta(
                  schema.tables.length,
                  current.badge === "open"
                    ? when(current.entry?.openedAt ?? null, "opened")
                    : when(Date.parse(schema.updatedAt), "modified"),
                )}
                schema={schema}
                dbType={schema.dbType}
                badge={{ label: t(`home.badge.${current.badge}`), tone: "accent" }}
                openLabel={t("home.card.resume", { name: current.name })}
                menuLabel={t("home.card.actions", { name: current.name })}
                menuItems={
                  current.entry
                    ? entryMenu(current.entry, true)
                    : [
                        { label: t("home.action.resume"), onSelect: resumeCurrentSchema },
                        {
                          label: t("home.action.saveAs"),
                          onSelect: () => void handleSaveAs(),
                        },
                        {
                          label: t("home.action.deleteDraft"),
                          hint: t("home.action.deleteDraftHint"),
                          danger: true,
                          separatorBefore: true,
                          onSelect: () => setDeletingDraft(true),
                        },
                      ]
                }
                onOpen={resumeCurrentSchema}
              />
            </div>
          </section>
        )}

        {groups.map((group, index) => (
          <section key={group.key}>
            <h2
              className={`${GROUP_LABEL} ${index === 0 && !showCurrent ? "mt-1.5" : "mt-6"}`}
            >
              {group.key === "all" ? t("home.allSchemas") : t(`chat.groups.${group.key}`)}
            </h2>
            <div className={GRID} onKeyDown={moveFocus}>
              {group.entries.map(renderEntry)}
            </div>
          </section>
        ))}

        {noResults && (
          <div className="mx-auto mt-14 flex max-w-[420px] flex-col items-center gap-2 text-center">
            <p className="text-[14px] font-medium text-secondary">
              {t("home.noResults", { query: query.trim() })}
            </p>
            <p className="text-[12.5px] text-tertiary">{t("home.noResultsHint")}</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className={`${SECONDARY} mt-2`}
            >
              {t("home.clearSearch")}
            </button>
          </div>
        )}

        {missing.length > 0 && query.trim() === "" && (
          <MissingFiles
            entries={missing}
            onLocate={(path) => void locateHomeEntry(path)}
            onRemove={removeHomeEntries}
          />
        )}
      </div>

      {deletingDraft && (
        <DeleteDraftModal
          name={schema.name}
          onClose={() => setDeletingDraft(false)}
          onDelete={() => {
            setDeletingDraft(false);
            closeSchema();
          }}
        />
      )}
      {renaming && (
        <RenameSchemaModal
          initialName={renaming.name}
          onClose={() => setRenaming(null)}
          onRename={async (name) => {
            await renameHomeEntry(renaming.path, name);
            setRenaming(null);
          }}
        />
      )}
      {importOpen && <ImportModal fromHome onClose={closeImport} />}
    </div>
  );
}
