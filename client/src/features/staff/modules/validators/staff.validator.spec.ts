import { describe, expect, it } from 'vitest';
import {
  avatarFileSchema,
  createUnavailabilityBlockValidator,
  reviewUnavailabilityBlockValidator,
  updateStaffProfileValidator,
} from './staff.validator';

describe('updateStaffProfileValidator', () => {
  it('accepts a partial, valid payload', () => {
    const result = updateStaffProfileValidator.safeParse({
      display_name: 'Jamie Cruz',
      preferred_communication_channel: 'Text',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an empty payload', () => {
    expect(updateStaffProfileValidator.safeParse({}).success).toBe(true);
  });

  it('rejects an empty display name', () => {
    const result = updateStaffProfileValidator.safeParse({
      display_name: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field, e.g. role', () => {
    const result = updateStaffProfileValidator.safeParse({
      role: 'Admin',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid communication channel', () => {
    const result = updateStaffProfileValidator.safeParse({
      preferred_communication_channel: 'Carrier Pigeon',
    });

    expect(result.success).toBe(false);
  });
});

describe('avatarFileSchema', () => {
  it('accepts a valid png under the size limit', () => {
    const file = new File(['x'], 'avatar.png', { type: 'image/png' });

    expect(avatarFileSchema.safeParse(file).success).toBe(true);
  });

  it('rejects an unsupported mime type', () => {
    const file = new File(['x'], 'avatar.gif', { type: 'image/gif' });

    const result = avatarFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it('rejects a file over 5MB', () => {
    const bigContent = new Uint8Array(5 * 1024 * 1024 + 1);
    const file = new File([bigContent], 'avatar.png', { type: 'image/png' });

    const result = avatarFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });
});

describe('createUnavailabilityBlockValidator', () => {
  // Computed relative to "now" (not a hardcoded date) so these stay valid as
  // time passes - the validator now rejects past start times/dates.
  function tomorrowDatetimeLocal(hour: string): string {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const datePart = tomorrow.toISOString().slice(0, 10);
    return `${datePart}T${hour}`;
  }

  function tomorrowDate(): string {
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  it('accepts a quick-action payload', () => {
    const result = createUnavailabilityBlockValidator.safeParse({
      quick_action: true,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid custom range', () => {
    const result = createUnavailabilityBlockValidator.safeParse({
      start_time: tomorrowDatetimeLocal('09:00'),
      end_time: tomorrowDatetimeLocal('17:00'),
      reason: 'Vet appointment',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a payload with neither quick_action nor a range', () => {
    const result = createUnavailabilityBlockValidator.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects an end time before the start time', () => {
    const result = createUnavailabilityBlockValidator.safeParse({
      start_time: tomorrowDatetimeLocal('17:00'),
      end_time: tomorrowDatetimeLocal('09:00'),
    });

    expect(result.success).toBe(false);
  });

  it('rejects a start time in the past', () => {
    const result = createUnavailabilityBlockValidator.safeParse({
      start_time: '2020-01-01T09:00',
      end_time: '2020-01-01T17:00',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a full-day date in the past', () => {
    const result = createUnavailabilityBlockValidator.safeParse({
      is_full_day: true,
      date: '2020-01-01',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a full-day date today or later', () => {
    const result = createUnavailabilityBlockValidator.safeParse({
      is_full_day: true,
      date: tomorrowDate(),
    });

    expect(result.success).toBe(true);
  });
});

describe('reviewUnavailabilityBlockValidator', () => {
  it('accepts an approve decision with no reason', () => {
    const result = reviewUnavailabilityBlockValidator.safeParse({
      decision: 'approved',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a deny decision with a reason', () => {
    const result = reviewUnavailabilityBlockValidator.safeParse({
      decision: 'denied',
      denial_reason: 'Short staffed that day',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid decision value', () => {
    const result = reviewUnavailabilityBlockValidator.safeParse({
      decision: 'maybe',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = reviewUnavailabilityBlockValidator.safeParse({
      decision: 'approved',
      staff_id: 'staff-1',
    });

    expect(result.success).toBe(false);
  });
});
