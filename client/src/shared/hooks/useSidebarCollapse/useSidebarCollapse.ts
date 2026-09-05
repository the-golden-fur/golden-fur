import { useContext } from 'react';
import { SidebarCollapseContext } from '../../providers/SidebarCollapseProvider/sidebarCollapseContext';

/** Reads/drives the dashboard Sidebar's collapsed state from anywhere under
 * AppShell's <Outlet/> - see SettingsPage, which force-collapses it while
 * open and restores the prior value on close. */
export function useSidebarCollapse() {
  return useContext(SidebarCollapseContext);
}
