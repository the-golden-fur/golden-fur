import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CurrentPrescription } from '../veterinary.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Issue #66: read-only, computed on demand - this pet's most recent
 * Completed consultation's medications array. Prior consultations are never
 * overwritten or archived; "current" simply means whichever consultation is
 * now most recent (#66 dev notes). Built as its own service, separate from
 * consultation.service.ts, since M05 (Sprint 4) will call it directly for
 * Hotel check-in auto-fill (Process 5, M07) and shouldn't need to import
 * anything else from this feature to do so.
 */
export async function getCurrentPrescription(
  petId: string
): Promise<CurrentPrescription | null> {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, medications, completed_at')
    .eq('pet_id', petId)
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) return null;

  return {
    consultation_id: data.id,
    completed_at: data.completed_at,
    medications: data.medications ?? [],
  };
}
