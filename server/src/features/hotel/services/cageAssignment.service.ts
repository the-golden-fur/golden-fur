import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Cage, CageSize } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface CageSuggestion {
  suggestedSize: CageSize;
  availableCages: Cage[];
}

/**
 * #75 AC-2: server-computed, not client-computed - reads pets.weight_class
 * and returns the matching cage_size category's currently-Available cages
 * at the branch. The receptionist's manual override is still validated
 * server-side against real availability in assignCage(), never accepted
 * blindly from the client.
 */
export async function suggestCage(
  petId: string,
  branchId: string
): Promise<CageSuggestion> {
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('weight_class')
    .eq('id', petId)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);
  if (!pet) throwWithStatus(404, 'Pet not found');

  const suggestedSize = pet.weight_class as CageSize;

  const { data: cages, error: cagesError } = await supabase
    .from('cages')
    .select('*')
    .eq('branch_id', branchId)
    .eq('size', suggestedSize)
    .eq('status', 'Available');

  if (cagesError) throwWithStatus(400, cagesError.message);

  return { suggestedSize, availableCages: (cages ?? []) as Cage[] };
}

/**
 * #75 AC-2/AC-4: claims a cage by conditionally flipping its status to
 * Occupied only where it is still Available (an optimistic claim, since
 * supabase-js has no cross-table transaction here) - a cage already
 * Occupied or Under Maintenance is rejected with a clear error, and zero
 * rows updated is the same rejection path whether the cage never existed at
 * this branch or was claimed by a concurrent check-in first.
 */
export async function assignCage(
  cageId: string,
  branchId: string
): Promise<Cage> {
  const { data: updated, error } = await supabase
    .from('cages')
    .update({ status: 'Occupied', updated_at: new Date().toISOString() })
    .eq('id', cageId)
    .eq('branch_id', branchId)
    .eq('status', 'Available')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!updated) {
    throwWithStatus(
      409,
      'Selected cage is not available (already occupied or under maintenance)'
    );
  }

  return updated as Cage;
}

/** Compensating action if a later step in check-in fails after the cage was
 * already claimed (#75 dev notes: no intermediate state should be
 * observable on success, but a failed check-in must not strand a cage as
 * Occupied with no hotel_stays row behind it). */
export async function releaseCage(cageId: string): Promise<void> {
  await supabase
    .from('cages')
    .update({ status: 'Available', updated_at: new Date().toISOString() })
    .eq('id', cageId);
}
