import type { Cage } from '../../hotel.types';

/** Custom change (front-desk cage override): roles that may close a cage to
 * customers for a while - mirrors the server's HOTEL_FRONT_DESK_ROLES. */
export const OVERRIDE_ROLES = [
  'Receptionist',
  'Front Desk',
  'Supervisor',
  'Admin',
  'Superadmin',
];

/** True while a front-desk closure is still in effect at `now` (ms). */
export function isClosedToCustomers(cage: Cage, now: number): boolean {
  return !!cage.closed_until && new Date(cage.closed_until).getTime() > now;
}

/** "3:15 PM", or "Tue 3:15 PM" when the time falls on another day. */
export function formatClosedUntil(iso: string, now: number): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return date.toDateString() === new Date(now).toDateString()
    ? time
    : `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}
