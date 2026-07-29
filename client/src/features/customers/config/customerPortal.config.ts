import {
  CalendarPlus,
  ClipboardList,
  Home,
  PawPrint,
  Settings,
} from 'lucide-react';
import type { SidebarSection } from '../../../shared/components/Sidebar/Sidebar';

/**
 * Every customer sees the same destinations - kept as a static list, not a
 * role-config system like the staff dashboard (staffDashboard.config.ts).
 * Single `label: null` section renders as a flat list (Sidebar), same as
 * every non-admin staff role.
 */
export const CUSTOMER_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: null,
    items: [
      { title: 'Home', to: '/portal', icon: Home },
      { title: 'Book a Service', to: '/portal/book', icon: CalendarPlus },
      { title: 'My Bookings', to: '/portal/bookings', icon: ClipboardList },
      { title: 'Pet Manager', to: '/portal/pets', icon: PawPrint },
      { title: 'Settings', to: '/portal/settings', icon: Settings },
    ],
  },
];
