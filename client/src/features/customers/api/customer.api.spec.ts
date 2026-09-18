import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPet,
  deleteOwnAccount,
  getCustomerProfile,
  getOwnCustomerAccountStatus,
  updateCustomerProfile,
} from './customer.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('customer.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getCustomerProfile returns the unwrapped profile on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ customer: { id: 'customer-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCustomerProfile('customer-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/customer-1'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    );
    expect(result).toEqual({ data: { id: 'customer-1' }, error: null });
  });

  it('getCustomerProfile returns an error instead of throwing on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await getCustomerProfile('customer-2', 'token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });

  it('updateCustomerProfile PATCHes with the given payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ customer: { id: 'customer-1', full_name: 'New Name' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateCustomerProfile('customer-1', 'token', {
      full_name: 'New Name',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/customer-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'New Name' }),
      })
    );
    expect(result.data?.full_name).toBe('New Name');
  });

  it('createPet POSTs to the nested customer pets route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ pet: { id: 'pet-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      name: 'Buddy',
      pet_type: 'Dog' as const,
      weight_class: 'M' as const,
      coat_type: 'SC' as const,
    };

    const result = await createPet('customer-1', 'token', payload);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/customer-1/pets'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
    expect(result).toEqual({ data: { id: 'pet-1' }, error: null });
  });

  it('getOwnCustomerAccountStatus returns the customer plus the auto-delete day count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        customer: { id: 'customer-1', is_active: false },
        auto_delete_policy_days: 30,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getOwnCustomerAccountStatus('customer-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/customer-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
    expect(result.data).toEqual({
      customer: { id: 'customer-1', is_active: false },
      auto_delete_policy_days: 30,
    });
  });

  it('deleteOwnAccount DELETEs the self-service route and returns the outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ outcome: 'anonymized' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteOwnAccount('customer-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/customers/customer-1/self'),
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer token' },
      })
    );
    expect(result.data).toEqual({ outcome: 'anonymized' });
  });

  it('deleteOwnAccount returns an error instead of throwing on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await deleteOwnAccount('customer-2', 'token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });
});
