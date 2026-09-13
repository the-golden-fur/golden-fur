import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface RequesterScopedParams {
  requesterId: string;
  customerId?: string;
}

/**
 * Shared by spinWheel.service.ts and customerCoupons.service.ts - mirrors
 * creditBalance.service.ts's own resolveTargetCustomerId exactly (a
 * customer may only ever act on themselves; a staff member must explicitly
 * name the customer_id they're acting on behalf of, e.g. a receptionist
 * triggering a walk-in's earned spin).
 */
export async function resolveTargetCustomerId({
  requesterId,
  customerId,
}: RequesterScopedParams): Promise<string> {
  const staffRole = await getStaffRoleOrNull(requesterId);

  if (!staffRole) {
    if (customerId && customerId !== requesterId) {
      throwWithStatus(403, 'Forbidden');
    }
    return requesterId;
  }

  return customerId ?? requesterId;
}
