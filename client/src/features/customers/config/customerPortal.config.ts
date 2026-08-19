import {
  Bell,
  CalendarPlus,
  ClipboardList,
  PawPrint,
  Receipt,
  Salad,
} from 'lucide-react';
import type { SidebarSection } from '../../../shared/components/Sidebar/Sidebar';

/**
 * Every customer sees the same destinations - kept as a static list, not a
 * role-config system like the staff dashboard (staffDashboard.config.ts).
 * Single `label: null` section renders as a flat list (Sidebar), same as
 * every non-admin staff role.
 *
 * No Settings entry here - the Navbar's gear icon already links to
 * /portal/settings for every page (same as staff, whose sidebar config
 * never had one either), so a sidebar entry would just duplicate it.
 *
 * Custom change (live-review): no Home entry either, for the same reason -
 * the Navbar now has its own persistent Home icon button (mirrors the
 * Settings icon), so the sidebar doesn't need to duplicate that too.
 */
export const CUSTOMER_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: null,
    items: [
      { title: 'Notifications', to: '/portal/notifications', icon: Bell },
      { title: 'Book a Service', to: '/portal/book', icon: CalendarPlus },
      { title: 'My Bookings', to: '/portal/bookings', icon: ClipboardList },
      { title: 'Transactions', to: '/portal/transactions', icon: Receipt },
      { title: 'Pet Manager', to: '/portal/pets', icon: PawPrint },
      {
        title: 'Food & Medication',
        to: '/portal/food-medication',
        icon: Salad,
      },
    ],
  },
];
