import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ListFilter,
  Plus,
  Search,
  type LucideIcon,
} from 'lucide-react';
import {
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from '../QueueFilterBar/dateRangePreset';
import { FilterTile } from './FilterTile';
import type {
  DateRangeValue,
  FilterField,
  FilterTile as FilterTileState,
  FilterValue,
  SelectFilterField,
  SortFieldDescriptor,
  SortTile,
} from './filterField.types';
import styles from './FilterSortBar.module.css';

export interface FilterSortBarProps {
  filterFields: FilterField[];
  filterTiles: FilterTileState[];
  onAddFilter: (fieldId: string) => void;
  onChangeFilter: (fieldId: string, value: FilterValue) => void;
  onRemoveFilter: (fieldId: string) => void;

  sortFields: SortFieldDescriptor[];
  sortTile: SortTile | null;
  onChangeSort: (tile: SortTile | null) => void;

  /** Persistent search box - omit both to hide it. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Right-edge slot, e.g. a <ViewSwitcher />. */
  children?: ReactNode;
}

/**
 * Notion-style query bar: one "Filter" button + one "Sort" button, each of
 * which spawns a removable pill ("tile"). A tile's body opens a popover to
 * change its value; hovering the tile reveals an X to remove it. Search stays
 * a persistent box (high-frequency, always relevant). Fully controlled - the
 * page owns `filterTiles` / `sortTile` state.
 */
export function FilterSortBar({
  filterFields,
  filterTiles,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
  sortFields,
  sortTile,
  onChangeSort,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  children,
}: FilterSortBarProps) {
  const addedFieldIds = new Set(filterTiles.map((tile) => tile.fieldId));
  const hasTiles = filterTiles.length > 0 || sortTile !== null;

  return (
    <div className={styles.bar}>
      <div className={styles.controls}>
        {onSearchChange ? (
          <div className={styles.searchField}>
            <Search
              className={styles.searchIcon}
              size={15}
              aria-hidden="true"
            />
            <input
              className={styles.searchInput}
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue ?? ''}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        ) : null}

        <Dropdown label="Filter" icon={ListFilter}>
          {(close) => (
            <div className={styles.menuList} role="menu">
              {filterFields.map((field) => {
                const unavailable =
                  field.disabled || addedFieldIds.has(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    disabled={unavailable}
                    onClick={() => {
                      onAddFilter(field.id);
                      close();
                    }}
                  >
                    <Plus size={13} aria-hidden="true" />
                    {field.label}
                  </button>
                );
              })}
            </div>
          )}
        </Dropdown>

        <Dropdown label="Sort" icon={ArrowUpDown}>
          {(close) => (
            <div className={styles.menuList} role="menu">
              {sortFields.flatMap((field) =>
                field.directions.map((direction) => {
                  const selected =
                    sortTile?.fieldId === field.id &&
                    sortTile.direction === direction.value;
                  return (
                    <button
                      key={`${field.id}-${direction.value}`}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        onChangeSort({
                          fieldId: field.id,
                          direction: direction.value,
                        });
                        close();
                      }}
                    >
                      {selected ? (
                        <Check size={13} aria-hidden="true" />
                      ) : (
                        <span className={styles.menuCheckSpacer} />
                      )}
                      {field.label} · {direction.label}
                    </button>
                  );
                })
              )}
              {sortTile ? (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    onChangeSort(null);
                    close();
                  }}
                >
                  <span className={styles.menuCheckSpacer} />
                  Clear sort
                </button>
              ) : null}
            </div>
          )}
        </Dropdown>

        {children ? (
          <div className={styles.childrenSlot}>{children}</div>
        ) : null}
      </div>

      {hasTiles ? (
        <div className={styles.tiles}>
          {filterTiles.map((tile) => {
            const field = filterFields.find((f) => f.id === tile.fieldId);
            if (!field) return null;
            return (
              <FilterTile
                key={tile.fieldId}
                label={field.label}
                displayValue={field.formatValue(tile.value)}
                removeLabel={`Remove ${field.label} filter`}
                onRemove={() => onRemoveFilter(tile.fieldId)}
              >
                {(close) => (
                  <FilterEditor
                    field={field}
                    value={tile.value}
                    onChange={(value) => onChangeFilter(tile.fieldId, value)}
                    close={close}
                  />
                )}
              </FilterTile>
            );
          })}

          {sortTile
            ? (() => {
                const field = sortFields.find((f) => f.id === sortTile.fieldId);
                if (!field) return null;
                const directionLabel =
                  field.directions.find((d) => d.value === sortTile.direction)
                    ?.label ?? sortTile.direction;
                return (
                  <FilterTile
                    key="__sort__"
                    label="Sort"
                    displayValue={`${field.label} (${directionLabel})`}
                    removeLabel="Remove sort"
                    onRemove={() => onChangeSort(null)}
                  >
                    {(close) => (
                      <div className={styles.menuList} role="listbox">
                        {sortFields.flatMap((sortField) =>
                          sortField.directions.map((direction) => {
                            const selected =
                              sortTile.fieldId === sortField.id &&
                              sortTile.direction === direction.value;
                            return (
                              <button
                                key={`${sortField.id}-${direction.value}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={styles.menuItem}
                                onClick={() => {
                                  onChangeSort({
                                    fieldId: sortField.id,
                                    direction: direction.value,
                                  });
                                  close();
                                }}
                              >
                                {selected ? (
                                  <Check size={13} aria-hidden="true" />
                                ) : (
                                  <span className={styles.menuCheckSpacer} />
                                )}
                                {sortField.label} · {direction.label}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </FilterTile>
                );
              })()
            : null}
        </div>
      ) : null}
    </div>
  );
}

interface DropdownProps {
  label: string;
  icon: LucideIcon;
  children: (close: () => void) => ReactNode;
}

function Dropdown({ label, icon: Icon, children }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={styles.dropdown} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <Icon size={14} aria-hidden="true" />
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className={styles.menu}>{children(() => setIsOpen(false))}</div>
      ) : null}
    </div>
  );
}

interface FilterEditorProps {
  field: FilterField;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  close: () => void;
}

function FilterEditor({ field, value, onChange, close }: FilterEditorProps) {
  if (field.type === 'date-range') {
    const current: DateRangeValue =
      value && typeof value === 'object'
        ? value
        : { preset: 'all', from: null, to: null };
    return (
      <>
        <label className={styles.editorField}>
          <span className={styles.editorLabel}>Range</span>
          <select
            className={styles.editorControl}
            value={current.preset}
            onChange={(event) =>
              onChange({
                preset: event.target.value as DateRangePreset,
                from: null,
                to: null,
              })
            }
          >
            {DATE_RANGE_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {current.preset === 'custom' ? (
          <>
            <label className={styles.editorField}>
              <span className={styles.editorLabel}>From</span>
              <input
                className={styles.editorControl}
                type="date"
                value={current.from ?? ''}
                onChange={(event) =>
                  onChange({
                    ...current,
                    from: event.target.value || null,
                  })
                }
              />
            </label>
            <label className={styles.editorField}>
              <span className={styles.editorLabel}>To</span>
              <input
                className={styles.editorControl}
                type="date"
                value={current.to ?? ''}
                onChange={(event) =>
                  onChange({ ...current, to: event.target.value || null })
                }
              />
            </label>
          </>
        ) : null}
      </>
    );
  }

  return (
    <SelectEditor
      field={field}
      value={value}
      onChange={onChange}
      close={close}
    />
  );
}

interface SelectEditorProps {
  field: SelectFilterField;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  close: () => void;
}

function SelectEditor({ field, value, onChange, close }: SelectEditorProps) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const options =
    field.type === 'async-select' && trimmed
      ? field.options.filter((option) =>
          option.label.toLowerCase().includes(trimmed)
        )
      : field.options;

  return (
    <>
      {field.type === 'async-select' ? (
        <input
          className={styles.editorControl}
          type="text"
          placeholder={`Filter ${field.label.toLowerCase()}...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className={styles.optionList} role="listbox">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              className={styles.menuItem}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              {selected ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <span className={styles.menuCheckSpacer} />
              )}
              {option.label}
            </button>
          );
        })}
        {options.length === 0 ? (
          <p className={styles.editorEmpty}>No matches.</p>
        ) : null}
      </div>
    </>
  );
}
