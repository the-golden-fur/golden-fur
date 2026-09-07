import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Maximize2,
  Shield,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../shared/api/mfa.api';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useResizableWidth } from '../../shared/hooks/useResizableWidth/useResizableWidth';
import { useSidebarCollapse } from '../../shared/hooks/useSidebarCollapse/useSidebarCollapse';
import type { ThemeRole } from '../../shared/providers/ThemeProvider/themeContext';
import type { MfaStatusResponse } from '../../shared/auth/mfa.types';
import { ProfileTab } from './tabs/ProfileTab';
import { PreferencesTab } from './tabs/PreferencesTab';
import { AccountTab } from './tabs/AccountTab';
import { SecurityTab } from './tabs/SecurityTab';
import { ConfigTab } from './tabs/ConfigTab';
import { CONFIG_TILES, SYSTEM_CONFIG_TILE } from './configTiles.config';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  role: ThemeRole;
}

type SettingsTab =
  | 'profile'
  | 'preferences'
  | 'account'
  | 'security'
  | 'config';

type SidebarSortMode = 'custom' | 'alphabetical' | 'recent';

const TAB_LABELS: Record<SettingsTab, string> = {
  profile: 'Profile',
  preferences: 'Preferences',
  account: 'Account',
  security: 'Security',
  config: 'Config',
};

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  profile: UserRound,
  preferences: SlidersHorizontal,
  account: UserCog,
  security: Shield,
  config: Wrench,
};

const HOME_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff',
  customer: '/portal',
};

const SIDEBAR_DEFAULT_WIDTH = 224; // 14rem at the default 16px root
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;

// Same three-mode sort (custom/alphabetical/recent), same MoreOptionsMenu
// picker, and the same localStorage-best-effort persistence pattern as the
// dashboard Sidebar's own category sort (Sidebar.tsx) - this is a separate,
// smaller implementation (no drag-and-drop, just move up/down) rather than
// reusing Sidebar directly, since Sidebar's items are route NavLinks and
// this sidebar switches state instead. Config's own subitems get the same
// three modes, independently (their own sort/order/recent, scoped
// separately below).
const SORT_OPTIONS: Array<{ value: SidebarSortMode; label: string }> = [
  { value: 'custom', label: 'Custom order' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'recent', label: 'Recently accessed' },
];

function readStoredSort(key: string): SidebarSortMode {
  try {
    const value = window.localStorage.getItem(key);
    if (value === 'alphabetical' || value === 'recent' || value === 'custom') {
      return value;
    }
  } catch {
    // best-effort only
  }
  return 'custom';
}

function readStoredOrder(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

function readRecentMap(key: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function persistOrder(key: string, order: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(order));
  } catch {
    // best-effort only
  }
}

function readConfigExpanded(key: string): boolean {
  try {
    const value = window.localStorage.getItem(key);
    // Defaults expanded (VSCode's own settings tree opens its first/active
    // category expanded, not collapsed) unless explicitly collapsed before.
    return value === null ? true : value === 'true';
  } catch {
    return true;
  }
}

/** Same "unseen ids fall in at the end, in their original order" shape used
 * by both the top-level sections and Config's own subitems - a stored order
 * from before an id existed (Config for a brand-new Admin, or a subitem
 * that didn't exist yet) still works, the new one just lands last. */
function applyCustomOrder<T extends string>(ids: T[], order: T[] | null): T[] {
  if (!order) return ids;

  const remaining = new Set(ids);
  const ordered: T[] = [];
  for (const id of order) {
    if (remaining.has(id)) {
      ordered.push(id);
      remaining.delete(id);
    }
  }
  for (const id of ids) {
    if (remaining.has(id)) ordered.push(id);
  }
  return ordered;
}

/**
 * Settings shell: Profile / Account / Security / Config (Admin/Superadmin
 * only). Replaces the previous MFA-only page - Security below is that page's
 * original body, unchanged. `status` (from getMfaStatus, which already
 * returns the viewer's staff role) stays fetched here rather than per-tab
 * since it gates both the Config tab's visibility and reflects account-wide
 * state Security itself needs to render.
 *
 * Custom change: renders full-bleed inside AppShell's own content area (no
 * backdrop/floating card) - the old horizontal tab strip is a resizable
 * vertical sidebar (still role="tab" - ARIA's tablist pattern doesn't
 * require a horizontal layout, sortable Custom/Alphabetical/Recently-
 * accessed) that reads as a *second* sidebar sitting right beside the real
 * dashboard Sidebar, which this page force-collapses for the duration (see
 * the useSidebarCollapse effect below) to make room. The persistent app
 * Navbar swaps to a minimal "Settings" bar for the duration (see
 * Navbar.tsx).
 *
 * Custom change (Config subtiles): Config expands like a VSCode settings
 * category, listing every admin-config page underneath it (independently
 * sortable, same as the top level). Selecting one embeds that page's real
 * component directly in the content pane (no navigation - `configTarget`
 * tracks which one); a button in the header instead navigates to that
 * page's real standalone route, since these are full, independently-routed
 * admin pages, not Settings-owned content.
 *
 * Custom change (fix): `activeTab`/`configTarget` are plain component
 * state, not `useSearchParams` or router `location.state` - several
 * embedded Config pages (e.g. AdminServicesAndPackagesPage) own their own
 * `?section=` query param, and *any* `navigate()`/`setSearchParams()` call
 * anywhere in the tree - including one an embedded page makes for its own
 * unrelated state - creates a new location with a fresh `state` (React
 * Router does not merge it forward), which was silently wiping this page's
 * own selection out from under it (the reported "clicking Service Types
 * redirects to Profile" bug - `location.state` turned out to have exactly
 * the same failure mode as `useSearchParams`, not a fix for it). Plain
 * `useState` is immune to any of that: it isn't tied to the URL at all, so
 * Settings no longer supports deep-linking to a specific tab.
 */
export function SettingsPage({ role }: SettingsPageProps) {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTabState] = useState<SettingsTab>('profile');
  const [configTarget, setConfigTarget] = useState<string | null>(null);
  const {
    collapsed: dashboardSidebarCollapsed,
    setCollapsed: setDashboardSidebarCollapsed,
  } = useSidebarCollapse();
  const initialSidebarCollapsedRef = useRef(dashboardSidebarCollapsed);
  const [sortMode, setSortMode] = useState<SidebarSortMode>(() =>
    readStoredSort(`settings-sidebar-sort-${role}`)
  );
  const [customOrder, setCustomOrder] = useState<SettingsTab[] | null>(
    () =>
      readStoredOrder(`settings-sidebar-order-${role}`) as SettingsTab[] | null
  );
  const [recentMap, setRecentMap] = useState<Record<string, number>>(() =>
    readRecentMap(`settings-sidebar-recent-${role}`)
  );
  const [isConfigExpanded, setIsConfigExpanded] = useState(() =>
    readConfigExpanded(`settings-sidebar-config-expanded-${role}`)
  );
  const [configSortMode, setConfigSortMode] = useState<SidebarSortMode>(() =>
    readStoredSort(`settings-config-sort-${role}`)
  );
  const [configCustomOrder, setConfigCustomOrder] = useState<string[] | null>(
    () => readStoredOrder(`settings-config-order-${role}`)
  );
  const [configRecentMap, setConfigRecentMap] = useState<
    Record<string, number>
  >(() => readRecentMap(`settings-config-recent-${role}`));

  const { width: sidebarWidth, handleProps: sidebarResizeHandleProps } =
    useResizableWidth({
      storageKey: `settings-sidebar-width-${role}`,
      defaultWidth: SIDEBAR_DEFAULT_WIDTH,
      min: SIDEBAR_MIN_WIDTH,
      max: SIDEBAR_MAX_WIDTH,
    });

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void getMfaStatus(role, accessToken).then((result) => {
      if (isMounted && result.data) {
        setStatus(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [role, accessToken, refreshKey]);

  // Auto-collapse the real dashboard sidebar for the duration of Settings
  // (it becomes a second sidebar's neighbor, not something to browse), then
  // restore whatever the user had before opening it.
  useEffect(() => {
    const wasCollapsed = initialSidebarCollapsedRef.current;
    setDashboardSidebarCollapsed(true);
    return () => setDashboardSidebarCollapsed(wasCollapsed);
  }, [setDashboardSidebarCollapsed]);

  const isAdmin =
    role === 'staff' &&
    (status?.role === 'Admin' || status?.role === 'Superadmin');
  const isSuperadmin = status?.role === 'Superadmin';

  const configTiles = useMemo(
    () => (isSuperadmin ? [...CONFIG_TILES, SYSTEM_CONFIG_TILE] : CONFIG_TILES),
    [isSuperadmin]
  );

  const tabs: SettingsTab[] = useMemo(
    () =>
      isAdmin
        ? ['profile', 'preferences', 'account', 'security', 'config']
        : ['profile', 'preferences', 'account', 'security'],
    [isAdmin]
  );

  const activeConfigTile =
    activeTab === 'config' && configTarget
      ? configTiles.find((tile) => tile.to === configTarget)
      : undefined;

  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTabState(tab);
      setConfigTarget(null);

      const nextRecent = { ...recentMap, [tab]: Date.now() };
      setRecentMap(nextRecent);
      try {
        window.localStorage.setItem(
          `settings-sidebar-recent-${role}`,
          JSON.stringify(nextRecent)
        );
      } catch {
        // best-effort only
      }
    },
    [recentMap, role]
  );

  const selectConfigTile = useCallback(
    (to: string | null) => {
      setActiveTabState('config');
      setConfigTarget(to);

      if (to) {
        const nextRecent = { ...configRecentMap, [to]: Date.now() };
        setConfigRecentMap(nextRecent);
        try {
          window.localStorage.setItem(
            `settings-config-recent-${role}`,
            JSON.stringify(nextRecent)
          );
        } catch {
          // best-effort only
        }
      }
    },
    [configRecentMap, role]
  );

  const toggleConfigExpanded = () => {
    setIsConfigExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          `settings-sidebar-config-expanded-${role}`,
          String(next)
        );
      } catch {
        // best-effort only
      }
      return next;
    });
  };

  const orderedTabs = useMemo(() => {
    if (sortMode === 'alphabetical') {
      return [...tabs].sort((a, b) =>
        TAB_LABELS[a].localeCompare(TAB_LABELS[b])
      );
    }
    if (sortMode === 'recent') {
      return [...tabs].sort(
        (a, b) => (recentMap[b] ?? 0) - (recentMap[a] ?? 0)
      );
    }
    return applyCustomOrder(tabs, customOrder);
  }, [tabs, sortMode, recentMap, customOrder]);

  const orderedConfigTiles = useMemo(() => {
    if (configSortMode === 'alphabetical') {
      return [...configTiles].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (configSortMode === 'recent') {
      return [...configTiles].sort(
        (a, b) => (configRecentMap[b.to] ?? 0) - (configRecentMap[a.to] ?? 0)
      );
    }
    const orderedIds = applyCustomOrder(
      configTiles.map((tile) => tile.to),
      configCustomOrder
    );
    const byTo = new Map(configTiles.map((tile) => [tile.to, tile]));
    return orderedIds
      .map((id) => byTo.get(id))
      .filter((tile): tile is (typeof configTiles)[number] => Boolean(tile));
  }, [configTiles, configSortMode, configRecentMap, configCustomOrder]);

  const changeSortMode = (mode: SidebarSortMode) => {
    setSortMode(mode);
    try {
      window.localStorage.setItem(`settings-sidebar-sort-${role}`, mode);
    } catch {
      // best-effort only
    }
  };

  const changeConfigSortMode = (mode: SidebarSortMode) => {
    setConfigSortMode(mode);
    try {
      window.localStorage.setItem(`settings-config-sort-${role}`, mode);
    } catch {
      // best-effort only
    }
  };

  const moveTab = (tab: SettingsTab, direction: -1 | 1) => {
    const index = orderedTabs.indexOf(tab);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= orderedTabs.length) return;

    const next = [...orderedTabs];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setCustomOrder(next);
    persistOrder(`settings-sidebar-order-${role}`, next);
  };

  const moveConfigTile = (to: string, direction: -1 | 1) => {
    const ids = orderedConfigTiles.map((tile) => tile.to);
    const index = ids.indexOf(to);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= ids.length) return;

    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
    setConfigCustomOrder(ids);
    persistOrder(`settings-config-order-${role}`, ids);
  };

  const closeSettings = () => navigate(HOME_PATH_BY_ROLE[role]);

  // Since an embedded Config page is a real, independently-routed admin
  // page (not Settings-owned content), this navigates to its own route
  // rather than doing anything to this panel.
  const openActiveTileFullPage = () => {
    if (activeConfigTile) {
      navigate(activeConfigTile.to);
    }
  };

  const sortMenuItems: MoreOptionsMenuItem[] = SORT_OPTIONS.map((option) => ({
    label: `Sort: ${option.label}`,
    active: sortMode === option.value,
    onSelect: () => changeSortMode(option.value),
  }));

  const configSortMenuItems: MoreOptionsMenuItem[] = SORT_OPTIONS.map(
    (option) => ({
      label: `Sort: ${option.label}`,
      active: configSortMode === option.value,
      onSelect: () => changeConfigSortMode(option.value),
    })
  );

  if (!user?.id || !accessToken) {
    return (
      <div className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your settings.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.panelHeader}>
        <h1 className={styles.title}>Settings</h1>
        <div className={styles.panelHeaderActions}>
          <MoreOptionsMenu
            label="Sort settings sections"
            items={sortMenuItems}
          />
          {activeConfigTile ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Open as a full page"
              onClick={openActiveTileFullPage}
            >
              <Maximize2 size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close settings"
            onClick={closeSettings}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>
        <div
          className={styles.sidebar}
          style={{ width: sidebarWidth }}
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
        >
          {orderedTabs.map((tab, index) => {
            const Icon = TAB_ICONS[tab];
            const isConfig = tab === 'config';

            return (
              <div key={tab} className={styles.sidebarGroup}>
                <div className={styles.sidebarItemRow}>
                  {isConfig ? (
                    <button
                      type="button"
                      className={styles.sidebarChevron}
                      aria-expanded={isConfigExpanded}
                      aria-label={
                        isConfigExpanded ? 'Collapse Config' : 'Expand Config'
                      }
                      onClick={toggleConfigExpanded}
                    >
                      {isConfigExpanded ? (
                        <ChevronDown size={14} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={14} aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab && !activeConfigTile}
                    className={
                      activeTab === tab && !activeConfigTile
                        ? `${styles.sidebarItem} ${styles.sidebarItemActive}`
                        : styles.sidebarItem
                    }
                    onClick={() =>
                      isConfig ? selectConfigTile(null) : setActiveTab(tab)
                    }
                  >
                    <Icon size={16} aria-hidden="true" />
                    {TAB_LABELS[tab]}
                  </button>
                  {isConfig && isConfigExpanded && configTiles.length > 1 ? (
                    <MoreOptionsMenu
                      label="Sort Config"
                      items={configSortMenuItems}
                    />
                  ) : null}
                  {sortMode === 'custom' && orderedTabs.length > 1 ? (
                    <div className={styles.reorderButtons}>
                      <button
                        type="button"
                        className={styles.reorderButton}
                        aria-label={`Move ${TAB_LABELS[tab]} up`}
                        disabled={index === 0}
                        onClick={() => moveTab(tab, -1)}
                      >
                        <ChevronUp size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.reorderButton}
                        aria-label={`Move ${TAB_LABELS[tab]} down`}
                        disabled={index === orderedTabs.length - 1}
                        onClick={() => moveTab(tab, 1)}
                      >
                        <ChevronDown size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {isConfig && isConfigExpanded ? (
                  <div className={styles.sidebarSubitems}>
                    {orderedConfigTiles.map((tile, tileIndex) => {
                      const TileIcon = tile.icon;
                      return (
                        <div key={tile.to} className={styles.sidebarItemRow}>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={activeConfigTile?.to === tile.to}
                            className={
                              activeConfigTile?.to === tile.to
                                ? `${styles.sidebarSubitem} ${styles.sidebarItemActive}`
                                : styles.sidebarSubitem
                            }
                            onClick={() => selectConfigTile(tile.to)}
                          >
                            <TileIcon size={14} aria-hidden="true" />
                            {tile.title}
                          </button>
                          {configSortMode === 'custom' &&
                          orderedConfigTiles.length > 1 ? (
                            <div className={styles.reorderButtons}>
                              <button
                                type="button"
                                className={styles.reorderButton}
                                aria-label={`Move ${tile.title} up`}
                                disabled={tileIndex === 0}
                                onClick={() => moveConfigTile(tile.to, -1)}
                              >
                                <ChevronUp size={12} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={styles.reorderButton}
                                aria-label={`Move ${tile.title} down`}
                                disabled={
                                  tileIndex === orderedConfigTiles.length - 1
                                }
                                onClick={() => moveConfigTile(tile.to, 1)}
                              >
                                <ChevronDown size={12} aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          <div
            {...sidebarResizeHandleProps}
            aria-label="Resize settings sidebar"
            className={styles.sidebarResizeHandle}
          />
        </div>

        <div className={styles.content}>
          {activeTab === 'profile' ? (
            <ProfileTab
              role={role}
              userId={user.id}
              accessToken={accessToken}
            />
          ) : null}
          {activeTab === 'preferences' ? (
            <PreferencesTab
              role={role}
              userId={user.id}
              accessToken={accessToken}
            />
          ) : null}
          {activeTab === 'account' ? (
            <AccountTab
              role={role}
              userId={user.id}
              accessToken={accessToken}
            />
          ) : null}
          {activeTab === 'security' ? (
            <SecurityTab
              role={role}
              accessToken={accessToken}
              status={status}
              onChanged={() => setRefreshKey((key) => key + 1)}
            />
          ) : null}
          {activeTab === 'config' && isAdmin ? (
            activeConfigTile ? (
              <activeConfigTile.Component />
            ) : (
              <ConfigTab
                isSuperadmin={isSuperadmin}
                onSelectTile={(tile) => selectConfigTile(tile.to)}
              />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
