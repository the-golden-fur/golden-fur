import { createContext } from 'react';

export interface SidebarCollapseContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

export const SidebarCollapseContext =
  createContext<SidebarCollapseContextValue>({
    collapsed: false,
    setCollapsed: () => undefined,
  });
