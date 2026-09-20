import {
  CalendarPlus,
  ClipboardList,
  Gift,
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
 *
 * Custom change: no Notifications or Credits entry either, same reasoning -
 * the Navbar's bell (NotificationBell, with a "View all" link to
 * /portal/notifications in its dropdown) and credit balance pill
 * (CreditBalanceIndicator, linking straight to /portal/credits) already
 * cover both, so a sidebar entry for either would just duplicate it.
 */
export const CUSTOMER_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: null,
    items: [
      { title: 'Book a Service', to: '/portal/book', icon: CalendarPlus },
      { title: 'My Bookings', to: '/portal/bookings', icon: ClipboardList },
      { title: 'Transactions', to: '/portal/transactions', icon: Receipt },
      { title: 'My Rewards', to: '/portal/rewards', icon: Gift },
      { title: 'Pet Manager', to: '/portal/pets', icon: PawPrint },
      {
        title: 'Food & Medication',
        to: '/portal/food-medication',
        icon: Salad,
      },
    ],
  },
];
