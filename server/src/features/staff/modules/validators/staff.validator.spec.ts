import { describe, expect, it } from 'vitest';
import { updateStaffProfileValidator } from './staff.validator.ts';

describe('updateStaffProfileValidator', () => {
  it('passes a single allowed field', () => {
    const result = updateStaffProfileValidator.safeParse({
      display_name: 'Jane Doe',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ display_name: 'Jane Doe' });
    }
  });

  it('passes all allowed fields together', () => {
    const input = {
      display_name: 'Jane Doe',
      phone_number: '09171234567',
      emergency_contact_name: 'John Doe',
      emergency_contact_number: '09179876543',
      preferred_communication_channel: 'Viber',
    };
    const result = updateStaffProfileValidator.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('passes an empty payload (no-op update)', () => {
    const result = updateStaffProfileValidator.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field', () => {
    const result = updateStaffProfileValidator.safeParse({
      favorite_color: 'blue',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to set role', () => {
    const result = updateStaffProfileValidator.safeParse({
      role: 'Superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to set branch_id', () => {
    const result = updateStaffProfileValidator.safeParse({
      branch_id: 'some-other-branch',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to set username', () => {
    const result = updateStaffProfileValidator.safeParse({
      username: 'newusername',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to set profile_photo_url', () => {
    const result = updateStaffProfileValidator.safeParse({
      profile_photo_url: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string for display_name', () => {
    const result = updateStaffProfileValidator.safeParse({
      display_name: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a preferred_communication_channel outside the enum', () => {
    const result = updateStaffProfileValidator.safeParse({
      preferred_communication_channel: 'Email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a mix of valid and unknown fields', () => {
    const result = updateStaffProfileValidator.safeParse({
      display_name: 'Jane Doe',
      role: 'Admin',
    });
    expect(result.success).toBe(false);
  });
});
