import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { DaycareSession } from '../daycare.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const FIRST_HOUR_CHARGE = 100;
const SUCCEEDING_HOUR_CHARGE = 50;

/**
 * elapsed <= 1 hour -> flat ₱100. Otherwise ₱100 + ₱50 x each succeeding
 * hour, rounding any partial hour up to a full hour - e.g. 1h10m = 2 billable
 * hours = ₱150 (#65 dev notes' own worked example).
 *
 * Note for the reviewer: the Guide's AC-4 table claims 2h15m -> ₱250 ("3
 * billable succeeding hours"), which does not follow from this same formula
 * (2h15m -> 1h15m past the first hour -> ceil(1.25) = 2 succeeding hours ->
 * ₱200) or from the dev notes' own 1h10m example. ₱200 is what this
 * implementation computes; see the verification doc for the full note.
 */
export function computeDaycareCharge(
  checkInAt: Date,
  checkOutAt: Date
): number {
  const elapsedMinutes = (checkOutAt.getTime() - checkInAt.getTime()) / 60000;

  if (elapsedMinutes <= 60) return FIRST_HOUR_CHARGE;

  const succeedingHours = Math.ceil((elapsedMinutes - 60) / 60);
  return FIRST_HOUR_CHARGE + succeedingHours * SUCCEEDING_HOUR_CHARGE;
}

interface CheckOutParams {
  sessionId: string;
}

/**
 * Issue #65: checkout sets status = 'Completed' and computed_charge together,
 * atomically, so a session can never be marked Completed without a stored
 * charge. No real billing call is made - computed_charge is simply stored
 * and queryable.
 * TODO(Sprint 5, M08): post computed_charge as a real transaction line item
 * once M08 exists.
 */
export async function checkOutDaycareSession({
  sessionId,
}: CheckOutParams): Promise<DaycareSession> {
  const { data: session, error } = await supabase
    .from('daycare_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!session) throwWithStatus(404, 'Daycare session not found');
  if (session.status === 'Completed') {
    throwWithStatus(409, 'This daycare session is already checked out');
  }

  const now = new Date();
  const charge = computeDaycareCharge(new Date(session.check_in_at), now);

  const { data: updated, error: updateError } = await supabase
    .from('daycare_sessions')
    .update({
      status: 'Completed',
      check_out_at: now.toISOString(),
      computed_charge: charge,
      updated_at: now.toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    throwWithStatus(
      400,
      updateError?.message ?? 'Failed to check out daycare session'
    );
  }

  return updated as DaycareSession;
}
