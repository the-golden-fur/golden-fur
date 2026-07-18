import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { AvailableStaff, Booking, ServiceCategory } from '../booking.types.ts';
import { listAvailableStaff } from './staffPicker.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

type WeightClass = 'S' | 'M' | 'L' | 'XL';

/**
 * STUB capacity numbers (Guide #51 dev notes):
 *
 * - Hotel: the real cages table is M05/Sprint 4 scope, so cage capacity is a
 *   per-branch, per-size configurable number rather than a query against a
 *   table that doesn't exist yet. Override via HOTEL_CAGE_CAPACITY (JSON,
 *   e.g. '{"S":10,"M":8,"L":6,"XL":4}' for all branches, or keyed by branch
 *   id: '{"<branch-uuid>":{"S":12,...}}').
 *   TODO(Sprint 4, M05): replace with a real count against the cages table.
 *
 * - Daycare: M06's daycare_sessions table is Sprint 3 scope - same stub
 *   approach. Override via DAYCARE_SESSION_CAPACITY (number for all branches
 *   or JSON keyed by branch id).
 *   TODO(Sprint 3, M06): replace with the per-branch session capacity config.
 */
const DEFAULT_HOTEL_CAGE_CAPACITY: Record<WeightClass, number> = {
  S: 10,
  M: 8,
  L: 6,
  XL: 4,
};

const DEFAULT_DAYCARE_SESSION_CAPACITY = 15;

function parseJsonEnv(name: string): unknown {
  const raw = process.env[name];

  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function getHotelCageCapacity(
  branchId: string,
  weightClass: WeightClass
): number {
  const configured = parseJsonEnv('HOTEL_CAGE_CAPACITY') as
    | Record<string, unknown>
    | undefined;

  if (configured) {
    const perBranch = configured[branchId] as
      | Record<string, number>
      | undefined;

    if (perBranch && typeof perBranch[weightClass] === 'number') {
      return perBranch[weightClass];
    }

    if (typeof configured[weightClass] === 'number') {
      return configured[weightClass] as number;
    }
  }

  return DEFAULT_HOTEL_CAGE_CAPACITY[weightClass];
}

export function getDaycareSessionCapacity(branchId: string): number {
  const raw = process.env.DAYCARE_SESSION_CAPACITY;

  if (raw) {
    const parsed = parseJsonEnv('DAYCARE_SESSION_CAPACITY');

    if (typeof parsed === 'number') return parsed;

    if (
      parsed &&
      typeof (parsed as Record<string, unknown>)[branchId] === 'number'
    ) {
      return (parsed as Record<string, number>)[branchId];
    }
  }

  return DEFAULT_DAYCARE_SESSION_CAPACITY;
}

export interface CapacityCheckParams {
  branchId: string;
  serviceCategory: ServiceCategory;
  scheduledStart: string;
  scheduledEnd: string;
  /** Hotel only: the booked pet's size category drives cage capacity. */
  petWeightClass?: WeightClass;
  /** Grooming/Veterinary: re-verify one specific staff member. */
  staffId?: string;
  /** #54 reschedule: exclude the booking being moved from overlap counts. */
  excludeBookingId?: string;
}

export interface CapacityCheckResult {
  available: boolean;
  reason?: string;
  /** Grooming/Veterinary: who passed, so confirmation can auto-assign. */
  eligibleStaff?: AvailableStaff[];
}

interface OverlappingBookingRow {
  id: string;
  pet_id: string;
  created_at: string;
}

async function listOverlappingConfirmedBookings({
  branchId,
  serviceCategory,
  scheduledStart,
  scheduledEnd,
  excludeBookingId,
}: CapacityCheckParams): Promise<OverlappingBookingRow[]> {
  let query = supabase
    .from('bookings')
    .select('id, pet_id, created_at')
    .eq('branch_id', branchId)
    .eq('service_category', serviceCategory)
    .eq('status', 'Confirmed')
    .lt('scheduled_start', scheduledEnd)
    .gt('scheduled_end', scheduledStart)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId);
  }

  const { data, error } = await query;

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as OverlappingBookingRow[];
}

/** Filters overlap rows down to pets in the same cage-size category. */
async function filterSameSizeRows(
  rows: OverlappingBookingRow[],
  weightClass: WeightClass
): Promise<OverlappingBookingRow[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('pets')
    .select('id')
    .in('id', Array.from(new Set(rows.map((row) => row.pet_id))))
    .eq('weight_class', weightClass);

  if (error) throwWithStatus(400, error.message);

  const sameSizePetIds = new Set(
    ((data ?? []) as Array<{ id: string }>).map((pet) => pet.id)
  );

  return rows.filter((row) => sameSizePetIds.has(row.pet_id));
}

/**
 * Issue #51: one capacity check, dispatched by service_category per
 * Modules-Features:
 * - Hotel: cage availability by size category (S/M/L/XL) - stub numbers, see
 *   header note;
 * - Grooming/Veterinary: at least one get_staff_availability()-eligible staff
 *   member (or the one specific staff member requested);
 * - Daycare: session capacity limit per branch - stub number.
 *
 * Runs twice by design (Guide #51): read-only when the Slot Picker queries
 * availability, and again as the authoritative check at submission - the
 * second run is never skipped as an optimization.
 */
export async function checkCapacity(
  params: CapacityCheckParams
): Promise<CapacityCheckResult> {
  const { serviceCategory } = params;

  if (serviceCategory === 'Grooming' || serviceCategory === 'Veterinary') {
    const eligibleStaff = await listAvailableStaff({
      branchId: params.branchId,
      serviceCategory,
      scheduledStart: params.scheduledStart,
      scheduledEnd: params.scheduledEnd,
      staffId: params.staffId,
      excludeBookingId: params.excludeBookingId,
    });

    return eligibleStaff.length > 0
      ? { available: true, eligibleStaff }
      : {
          available: false,
          reason: params.staffId
            ? 'The selected staff member is not available for the requested time'
            : `No eligible staff available for a ${serviceCategory} booking at the requested time`,
          eligibleStaff: [],
        };
  }

  if (serviceCategory === 'Hotel') {
    if (!params.petWeightClass) {
      throwWithStatus(400, 'Pet weight class is required for Hotel capacity');
    }

    const overlapping = await listOverlappingConfirmedBookings(params);
    const sameSize = await filterSameSizeRows(
      overlapping,
      params.petWeightClass
    );
    const capacity = getHotelCageCapacity(
      params.branchId,
      params.petWeightClass
    );

    return sameSize.length < capacity
      ? { available: true }
      : {
          available: false,
          reason: `No ${params.petWeightClass}-size cages available for the requested dates`,
        };
  }

  // Daycare
  const overlapping = await listOverlappingConfirmedBookings(params);
  const capacity = getDaycareSessionCapacity(params.branchId);

  return overlapping.length < capacity
    ? { available: true }
    : {
        available: false,
        reason: 'Daycare session capacity is full for the requested time',
      };
}

/**
 * Post-insert re-verification - the second half of #51's atomic-confirmation
 * requirement (AC-5). supabase-js has no client-side transactions, so two
 * simultaneous submissions for the last slot can both pass the pre-insert
 * check; both rows then land, and this deterministic re-count decides the
 * winner: rank all overlapping Confirmed rows by (created_at, id) and keep
 * only the first `capacity` of them. The caller deletes the row when this
 * returns false, so exactly one of two racers survives.
 */
export async function confirmCapacityAfterInsert(
  booking: Booking
): Promise<boolean> {
  if (
    booking.service_category === 'Grooming' ||
    booking.service_category === 'Veterinary'
  ) {
    const query = supabase
      .from('bookings')
      .select('id, created_at')
      .eq('assigned_staff_id', booking.assigned_staff_id)
      .eq('status', 'Confirmed')
      .lt('scheduled_start', booking.scheduled_end)
      .gt('scheduled_end', booking.scheduled_start)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    const { data, error } = await query;

    if (error) throwWithStatus(400, error.message);

    const rows = (data ?? []) as Array<{ id: string }>;

    return rows.length > 0 && rows[0].id === booking.id;
  }

  const baseParams: CapacityCheckParams = {
    branchId: booking.branch_id,
    serviceCategory: booking.service_category,
    scheduledStart: booking.scheduled_start,
    scheduledEnd: booking.scheduled_end,
  };

  if (booking.service_category === 'Hotel') {
    const { data: pet, error } = await supabase
      .from('pets')
      .select('weight_class')
      .eq('id', booking.pet_id)
      .maybeSingle();

    if (error) throwWithStatus(400, error.message);
    if (!pet) throwWithStatus(404, 'Pet not found');

    const weightClass = pet.weight_class as WeightClass;
    const overlapping = await listOverlappingConfirmedBookings(baseParams);
    const sameSize = await filterSameSizeRows(overlapping, weightClass);
    const capacity = getHotelCageCapacity(booking.branch_id, weightClass);

    return sameSize
      .slice(0, capacity)
      .some((row) => row.id === booking.id);
  }

  // Daycare
  const overlapping = await listOverlappingConfirmedBookings(baseParams);
  const capacity = getDaycareSessionCapacity(booking.branch_id);

  return overlapping.slice(0, capacity).some((row) => row.id === booking.id);
}
