import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './ExcludeListPanel.module.css';

type SortKey = 'name-asc' | 'name-desc' | 'role';

interface ExcludeListPanelProps<T> {
  title: string;
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  /** Present only for the staff list - enables the role filter dropdown and "Sort by role" option. */
  getRole?: (item: T) => string;
  excludedIds: Set<string>;
  onToggle: (id: string) => void;
  emptyMessage: string;
}

/**
 * Collapsed-by-default exclude picker shared by the "Exclude staff"/
 * "Exclude customers" sections of AnnouncementComposer - these lists can
 * run into the dozens of names once several roles or "Customers" is
 * checked, so search/filter/sort keeps them usable instead of a long
 * always-open scroll.
 */
export function ExcludeListPanel<T>({
  title,
  items,
  getId,
  getLabel,
  getRole,
  excludedIds,
  onToggle,
  emptyMessage,
}: ExcludeListPanelProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');

  const availableRoles = useMemo(() => {
    if (!getRole) return [];
    return [...new Set(items.map(getRole))].sort();
  }, [items, getRole]);

  const visibleItems = useMemo(() => {
    let next = items;

    if (roleFilter !== 'all' && getRole) {
      next = next.filter((item) => getRole(item) === roleFilter);
    }

    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      next = next.filter((item) => getLabel(item).toLowerCase().includes(needle));
    }

    const sorted = [...next];
    if (sortKey === 'name-asc') {
      sorted.sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
    } else if (sortKey === 'name-desc') {
      sorted.sort((a, b) => getLabel(b).localeCompare(getLabel(a)));
    } else if (sortKey === 'role' && getRole) {
      sorted.sort((a, b) => getRole(a).localeCompare(getRole(b)) || getLabel(a).localeCompare(getLabel(b)));
    }

    return sorted;
  }, [items, query, roleFilter, sortKey, getRole, getLabel]);

  const excludedCount = items.filter((item) => excludedIds.has(getId(item))).length;

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <span>{title}</span>
        {excludedCount > 0 ? (
          <span className={styles.count}>{excludedCount} excluded</span>
        ) : null}
      </button>

      {isOpen ? (
        <div className={styles.body}>
          <div className={styles.controls}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {getRole ? (
              <select
                className={styles.select}
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">All roles</option>
                {availableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className={styles.select}
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              {getRole ? <option value="role">Role</option> : null}
            </select>
          </div>

          <div className={styles.list}>
            {visibleItems.length === 0 ? (
              <p className={styles.copy}>{emptyMessage}</p>
            ) : (
              visibleItems.map((item) => {
                const id = getId(item);
                return (
                  <label key={id} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={excludedIds.has(id)}
                      onChange={() => onToggle(id)}
                    />
                    {getLabel(item)}
                    {getRole ? ` (${getRole(item)})` : ''}
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
