import type { UnavailabilityLeaveType } from '../../staff.types';

// Shared between MonthlySchedulePage.tsx and AutoBuildPreviewModal.tsx -
// pulled into their own module (rather than exported from the page) since
// a page component file may only export the component itself
// (react-refresh/only-export-components).

export const WEEKDAY_HEADERS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

export const LEAVE_TYPE_CLASS: Record<UnavailabilityLeaveType, string> = {
  'Rest Day': 'restDay',
  'Vacation Leave': 'vacationLeave',
  'Sick Leave': 'sickLeave',
  Other: 'other',
};

export const LEAVE_TYPE_ABBR: Record<UnavailabilityLeaveType, string> = {
  'Rest Day': 'RD',
  'Vacation Leave': 'VL',
  'Sick Leave': 'SL',
  Other: 'O',
};

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
