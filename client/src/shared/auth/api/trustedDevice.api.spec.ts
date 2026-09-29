import { describe, expect, it, afterEach } from 'vitest';
import {
  getStoredDeviceToken,
  storeDeviceToken,
  clearStoredDeviceToken,
} from './trustedDevice.api';

describe('trustedDevice.api', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getStoredDeviceToken('staff')).toBeNull();
  });

  it('stores and retrieves a token, scoped per role', () => {
    storeDeviceToken('staff', 'staff-token');
    storeDeviceToken('customer', 'customer-token');

    expect(getStoredDeviceToken('staff')).toBe('staff-token');
    expect(getStoredDeviceToken('customer')).toBe('customer-token');
  });

  it('clears the stored token for that role only', () => {
    storeDeviceToken('staff', 'staff-token');
    storeDeviceToken('customer', 'customer-token');

    clearStoredDeviceToken('staff');

    expect(getStoredDeviceToken('staff')).toBeNull();
    expect(getStoredDeviceToken('customer')).toBe('customer-token');
  });
});
