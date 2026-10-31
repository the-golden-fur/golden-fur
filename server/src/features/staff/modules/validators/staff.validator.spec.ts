import { describe, expect, it } from 'vitest';
import {
  createStaffAccountValidator,
  manageStaffAccountValidator,
  updateStaffProfileValidator,
  updateStaffUsernameValidator,
} from './staff.validator.ts';

describe('updateStaffProfileValidator', () => {
  it('passes a single allowed field', () => {
    const result = updateStaffProfileValidator.safeParse({
      nickname: 'Janey',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ nickname: 'Janey' });
    }
  });

  it('staff names: a nickname can be cleared (null or blank) but display_name is no longer accepted', () => {
    expect(updateStaffProfileValidator.parse({ nickname: '  ' })).toEqual({
      nickname: null,
    });
    expect(updateStaffProfileValidator.parse({ nickname: null })).toEqual({
      nickname: null,
    });
    expect(
      updateStaffProfileValidator.safeParse({ display_name: 'Jane Doe' })
        .success
    ).toBe(false);
  });

  it('passes all allowed fields together', () => {
    const input = {
      nickname: 'Janey',
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

  it('rejects an empty string for phone_number', () => {
    const result = updateStaffProfileValidator.safeParse({
      phone_number: '   ',
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
      nickname: 'Janey',
      role: 'Admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateStaffUsernameValidator', () => {
  it('passes a valid username', () => {
    const result = updateStaffUsernameValidator.safeParse({
      username: 'jamiec',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ username: 'jamiec' });
    }
  });

  it('rejects a username shorter than 3 characters', () => {
    const result = updateStaffUsernameValidator.safeParse({ username: 'jc' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing username', () => {
    const result = updateStaffUsernameValidator.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field alongside username', () => {
    const result = updateStaffUsernameValidator.safeParse({
      username: 'jamiec',
      role: 'Admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('staff names (first / middle / last + nickname)', () => {
  const account = {
    username: 'maria.dc',
    registered_email: 'maria@goldenfur.com',
    role: 'Receptionist',
    branch_id: '11111111-1111-4111-a111-111111111111',
  };

  it('create requires a first and last name, middle name and nickname optional', () => {
    expect(
      createStaffAccountValidator.safeParse({
        ...account,
        first_name: 'Maria',
        middle_name: 'Clara',
        last_name: 'Dela Cruz',
        nickname: 'Clara',
      }).success
    ).toBe(true);
    expect(
      createStaffAccountValidator.safeParse({
        ...account,
        first_name: 'Maria',
        last_name: 'Dela Cruz',
      }).success
    ).toBe(true);
    expect(
      createStaffAccountValidator.safeParse({ ...account, first_name: 'Maria' })
        .success
    ).toBe(false);
  });

  it('create no longer accepts display_name (it is derived)', () => {
    expect(
      createStaffAccountValidator.safeParse({
        ...account,
        first_name: 'Maria',
        last_name: 'Dela Cruz',
        display_name: 'Maria',
      }).success
    ).toBe(false);
  });

  it('manage accepts name changes on their own, but never a blank first/last name', () => {
    expect(
      manageStaffAccountValidator.safeParse({ nickname: 'Clara' }).success
    ).toBe(true);
    expect(
      manageStaffAccountValidator.safeParse({ middle_name: null }).success
    ).toBe(true);
    expect(
      manageStaffAccountValidator.safeParse({ first_name: '  ' }).success
    ).toBe(false);
  });
});
