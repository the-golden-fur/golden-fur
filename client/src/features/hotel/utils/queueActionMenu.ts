import type { MoreOptionsMenuItem } from '../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { completeCareLogEntry, startCareLogEntry } from '../api/hotel.api';
import type { CareLogEntry } from '../hotel.types';

const ACTIONABLE_STATUSES = new Set(['Pending', 'In Progress']);

/**
 * Custom change (Groomer/Pet Assistant check-in restriction): a stay can
 * have multiple CareLogEntry tasks (feeding/walking/playing/medication)
 * each with independent status, so a single "Mark as in progress/done"
 * menu item can only safely act directly when there's exactly one
 * actionable (Pending or In Progress) task for that stay today - 0 means
 * nothing to do, 2+ is ambiguous for a one-click action (the Kanban's own
 * per-task controls handle that case instead, via "View checklist items").
 */
export function countActionableTasks(
  entries: CareLogEntry[],
  stayId: string
): 0 | 1 | 'multiple' {
  const count = entries.filter(
    (entry) => entry.stay_id === stayId && ACTIONABLE_STATUSES.has(entry.status)
  ).length;

  if (count === 0) return 0;
  if (count === 1) return 1;
  return 'multiple';
}

interface BuildChecklistMenuItemsArgs {
  entries: CareLogEntry[];
  /** Null when the row isn't checked in yet - only "View booking details"
   * is offered in that case. */
  stayId: string | null;
  accessToken: string;
  onViewDetails: () => void;
  onViewChecklist: (stayId: string) => void;
  /** Called after a successful Mark as in progress/done, so the caller can
   * refetch its queue/care-log data. */
  onChanged: () => void;
}

export function buildChecklistMenuItems({
  entries,
  stayId,
  accessToken,
  onViewDetails,
  onViewChecklist,
  onChanged,
}: BuildChecklistMenuItemsArgs): MoreOptionsMenuItem[] {
  const items: MoreOptionsMenuItem[] = [
    { label: 'View booking details', onSelect: onViewDetails },
  ];

  if (!stayId) return items;

  items.push({
    label: 'View checklist items',
    onSelect: () => onViewChecklist(stayId),
  });

  if (countActionableTasks(entries, stayId) === 1) {
    const task = entries.find(
      (entry) =>
        entry.stay_id === stayId && ACTIONABLE_STATUSES.has(entry.status)
    );

    if (task?.status === 'Pending') {
      items.push({
        label: 'Mark as in progress',
        onSelect: () => {
          void startCareLogEntry(task.id, accessToken).then(onChanged);
        },
      });
    } else if (task?.status === 'In Progress') {
      items.push({
        label: 'Mark as done',
        onSelect: () => {
          void completeCareLogEntry(task.id, accessToken).then(onChanged);
        },
      });
    }
  }

  return items;
}
