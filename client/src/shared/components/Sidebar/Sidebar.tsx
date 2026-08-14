import type { LucideIcon } from 'lucide-react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import styles from './Sidebar.module.css';

export interface SidebarItem {
  title: string;
  to: string;
  icon?: LucideIcon;
}

export interface SidebarSection {
  /** null renders the section with no heading - used by every non-admin
   * staff role and the customer portal, so their nav looks like a single
   * flat list rather than an artificially-grouped one. */
  label: string | null;
  icon?: LucideIcon;
  items: SidebarItem[];
}

interface SidebarProps {
  sections: SidebarSection[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Collapsible left nav shared by the staff dashboard and customer portal
 * (AppShell). Admin/Superadmin see multiple labeled sections (their
 * dashboard config groups tiles by the lower-privilege role each belongs
 * to, since Admin/Superadmin can already reach all of them - see
 * staffDashboard.config.ts); every other role/the customer portal passes a
 * single `label: null` section, which renders identically to a flat list.
 */
export function Sidebar({
  sections,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={collapsed ? styles.sidebarCollapsed : styles.sidebar}
      aria-label="Dashboard navigation"
    >
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen size={18} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={18} aria-hidden="true" />
        )}
      </button>

      <nav className={styles.nav}>
        {sections.map((section, index) => {
          return (
            <div
              className={styles.section}
              key={section.label ?? `section-${index}`}
            >
              {section.label ? (
                <h2 className={styles.sectionLabel}>{section.label}</h2>
              ) : null}
              <ul className={styles.itemList}>
                {section.items.map((item) => {
                  const Icon = item.icon ?? section.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          isActive
                            ? `${styles.link} ${styles.linkActive}`
                            : styles.link
                        }
                        title={collapsed ? item.title : undefined}
                      >
                        {Icon ? <Icon size={17} aria-hidden="true" /> : null}
                        <span className={styles.linkText}>{item.title}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
