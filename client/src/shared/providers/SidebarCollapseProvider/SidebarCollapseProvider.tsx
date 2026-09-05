import { useMemo, type ReactNode } from 'react';
import { SidebarCollapseContext } from './sidebarCollapseContext';

interface SidebarCollapseProviderProps {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  children: ReactNode;
}

/** Thin wrapper around SidebarCollapseContext, matching the sibling
 * ThemeProvider/ToastProvider convention. AppShell owns the actual
 * collapsed state (and its localStorage persistence) since it's the sole
 * renderer of the dashboard Sidebar - this just exposes that state to
 * anything rendered under its <Outlet/> (e.g. SettingsPage, which
 * force-collapses it for the page's duration). */
export function SidebarCollapseProvider({
  collapsed,
  setCollapsed,
  children,
}: SidebarCollapseProviderProps) {
  const value = useMemo(
    () => ({ collapsed, setCollapsed }),
    [collapsed, setCollapsed]
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}
