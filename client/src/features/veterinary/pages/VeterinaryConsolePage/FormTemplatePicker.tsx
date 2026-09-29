import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Columns3,
  List as ListIcon,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import { getServiceIcon } from '../../../../shared/components/IconPicker/serviceIcons';
import type { ConsultationFormTemplate } from '../../veterinary.types';
import styles from './FormTemplatePicker.module.css';

type PickerView = 'list' | 'table' | 'board';
type SortDirection = 'asc' | 'desc';

interface FormTemplatePickerProps {
  /** Already filtered to templates not yet added to this visit's Results -
   * see ConsultationDetailPanel's own availableFormTemplates. */
  templates: ConsultationFormTemplate[];
  onSelect: (templateId: string) => void;
}

/**
 * Custom change: the Results section's "Add result from a form template..."
 * control, upgraded from a plain <select> into a small popover with the
 * same search/sort/filter/group-by/view toolset My Catalog's list pages
 * use - "enhance this Add result from a form template dropdown, transfer
 * the search, sort, filter, group by and view options here" (replacing the
 * earlier idea of a separate row action/modal for the same job). Anchored
 * with `position: fixed` (computed from the trigger's own screen position,
 * same technique as MoreOptionsMenu/CardContextMenu) since this control
 * lives inside a scrolling Modal - `position: absolute` here would get
 * clipped by that Modal's own overflow, same root cause as the Board
 * right-click menus.
 */
export function FormTemplatePicker({
  templates,
  onSelect,
}: FormTemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [defaultOnly, setDefaultOnly] = useState(false);
  const [view, setView] = useState<PickerView>('list');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    setPopoverStyle(
      rect
        ? {
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: Math.max(rect.width, 320),
          }
        : null
    );
    setIsOpen(true);
  }

  function selectTemplate(id: string) {
    onSelect(id);
    setIsOpen(false);
    setSearch('');
  }

  const query = search.trim().toLowerCase();
  const visible = templates
    .filter((template) => !defaultOnly || template.is_default)
    .filter((template) => !query || template.name.toLowerCase().includes(query))
    .sort((a, b) =>
      sortDirection === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );

  const boardGroups = [
    {
      label: 'Default',
      items: visible.filter((template) => template.is_default),
    },
    {
      label: 'Other',
      items: visible.filter((template) => !template.is_default),
    },
  ];

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
      >
        Add result from a form template...
      </button>

      {isOpen ? (
        <div
          className={styles.popover}
          style={popoverStyle ?? undefined}
          role="dialog"
          aria-label="Add a result from a form template"
        >
          <div className={styles.toolbar}>
            <div className={styles.searchField}>
              <Search size={14} aria-hidden="true" />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search forms..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
            </div>
            <button
              type="button"
              className={styles.toolbarButton}
              onClick={() =>
                setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
              }
            >
              Sort: {sortDirection === 'asc' ? 'A to Z' : 'Z to A'}
            </button>
            <label className={styles.filterToggle}>
              <input
                type="checkbox"
                checked={defaultOnly}
                onChange={(event) => setDefaultOnly(event.target.checked)}
              />
              Default only
            </label>
            <div className={styles.viewSwitcher} role="group" aria-label="View">
              <button
                type="button"
                aria-label="Table view"
                aria-pressed={view === 'table'}
                className={
                  view === 'table' ? styles.viewButtonActive : styles.viewButton
                }
                onClick={() => setView('table')}
              >
                <TableIcon size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === 'list'}
                className={
                  view === 'list' ? styles.viewButtonActive : styles.viewButton
                }
                onClick={() => setView('list')}
              >
                <ListIcon size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Board view"
                aria-pressed={view === 'board'}
                className={
                  view === 'board' ? styles.viewButtonActive : styles.viewButton
                }
                onClick={() => setView('board')}
              >
                <Columns3 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className={styles.empty}>No forms match.</p>
          ) : view === 'table' ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Default</th>
                  <th>Fields</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((template) => {
                  const Icon = getServiceIcon(template.icon);
                  return (
                    <tr
                      key={template.id}
                      className={styles.tableRow}
                      onClick={() => selectTemplate(template.id)}
                    >
                      <td className={styles.tableNameCell}>
                        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                        {template.name}
                      </td>
                      <td>{template.is_default ? 'Default' : '—'}</td>
                      <td>{template.fields.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : view === 'board' ? (
            <div className={styles.boardGroups}>
              {boardGroups.map((group) => (
                <div key={group.label} className={styles.boardColumn}>
                  <h4 className={styles.boardColumnTitle}>
                    {group.label}
                    <span className={styles.boardColumnCount}>
                      {group.items.length}
                    </span>
                  </h4>
                  {group.items.length === 0 ? (
                    <p className={styles.empty}>Nothing here.</p>
                  ) : (
                    group.items.map((template) => {
                      const Icon = getServiceIcon(template.icon);
                      return (
                        <button
                          key={template.id}
                          type="button"
                          className={styles.card}
                          onClick={() => selectTemplate(template.id)}
                        >
                          <span className={styles.cardName}>
                            {Icon ? (
                              <Icon size={14} aria-hidden="true" />
                            ) : null}
                            {template.name}
                          </span>
                          <span className={styles.cardMeta}>
                            {template.fields.length} fields
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((template) => {
                const Icon = getServiceIcon(template.icon);
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={styles.listItem}
                    onClick={() => selectTemplate(template.id)}
                  >
                    {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                    <span className={styles.itemName}>{template.name}</span>
                    {template.is_default ? (
                      <span className={styles.badge}>Default</span>
                    ) : null}
                    <span className={styles.badge}>
                      {template.fields.length} fields
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
