import { supabase } from '../../../config/supabase/supabase.config.ts';
import { staffNotificationEmail } from '../../notifications/modules/notificationEmail.util.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import {
  UNAVAILABILITY_MANAGER_ROLES,
  type UnavailabilityBlock,
} from '../staff.types.ts';

function formatWindow(block: UnavailabilityBlock, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = block.is_full_day
    ? { dateStyle: 'medium', timeZone: timezone }
    : { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone };
  const start = new Date(block.start_time).toLocaleString('en-US', options);

  if (block.is_full_day) return start;

  const end = new Date(block.end_time).toLocaleString('en-US', {
    timeStyle: 'short',
    timeZone: timezone,
  });
  return `${start} - ${end}`;
}

async function loadRequester(staffId: string) {
  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('display_name, branch_id')
    .eq('id', staffId)
    .maybeSingle();

  const { data: branch } = staff?.branch_id
    ? await supabase
        .from('branches')
        .select('timezone')
        .eq('id', staff.branch_id)
        .maybeSingle()
    : { data: null };

  return {
    name: (staff?.display_name as string | undefined) ?? 'A staff member',
    branchId: (staff?.branch_id as string | undefined) ?? null,
    timezone: (branch?.timezone as string | undefined) ?? 'Asia/Manila',
  };
}

/**
 * A staff member's own request just landed as 'pending' - tell whoever has
 * to act on it, in the bell and by email (each gated on the recipient's own
 * Settings > Preferences). Addressed to the requested reviewer when one was
 * picked; otherwise every Supervisor/Admin/Superadmin at the requester's
 * branch, since any of them may approve. Best-effort: a notification
 * failure never fails the request itself.
 */
export async function notifyDayOffRequested(
  block: UnavailabilityBlock
): Promise<void> {
  try {
    const requester = await loadRequester(block.staff_id);

    let recipientIds: string[] = [];

    if (block.requested_reviewer_id) {
      recipientIds = [block.requested_reviewer_id];
    } else if (requester.branchId) {
      const { data: managers, error } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('branch_id', requester.branchId)
        .eq('is_active', true)
        .in('role', [...UNAVAILABILITY_MANAGER_ROLES]);

      if (error) throw new Error(error.message);
      recipientIds = (managers ?? []).map((row) => row.id as string);
    }

    const title = 'Day off request to review';
    const reason = block.reason ? ` Reason: ${block.reason}.` : '';
    const message = `${requester.name} requested ${block.leave_type} for ${formatWindow(block, requester.timezone)}.${reason} Approve or deny it in the Days Off Approval Queue.`;

    for (const recipientId of recipientIds) {
      try {
        await createNotification({
          recipientStaffId: recipientId,
          eventType: 'day_off_requested',
          title,
          message,
          sendEmail: staffNotificationEmail(recipientId, title, message),
        });
      } catch (notifyError) {
        console.error(
          `Failed to notify ${recipientId} of day-off request ${block.id}:`,
          notifyError
        );
      }
    }
  } catch (error) {
    console.error(
      `Failed to send day-off request notifications for ${block.id}:`,
      error
    );
  }
}

/** The approver decided - tell the requester. Best-effort, like above. */
export async function notifyDayOffReviewed(
  block: UnavailabilityBlock
): Promise<void> {
  try {
    const requester = await loadRequester(block.staff_id);
    const approved = block.status === 'approved';
    const title = approved
      ? 'Day off request approved'
      : 'Day off request denied';
    const denial =
      !approved && block.denial_reason
        ? ` Reason: ${block.denial_reason}.`
        : '';
    const message = `Your ${block.leave_type} request for ${formatWindow(block, requester.timezone)} was ${approved ? 'approved' : 'denied'}.${denial}`;

    await createNotification({
      recipientStaffId: block.staff_id,
      eventType: 'day_off_reviewed',
      title,
      message,
      sendEmail: staffNotificationEmail(block.staff_id, title, message),
    });
  } catch (error) {
    console.error(
      `Failed to send day-off review notification for ${block.id}:`,
      error
    );
  }
}
