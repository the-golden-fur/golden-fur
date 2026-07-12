import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { signup } from '../../../../auth/customer/api/customerAuth.api';
import {
  listCustomers,
  updateCustomerProfile,
} from '../../../../customers/api/customer.api';
import { NewWalkInCustomerForm } from './NewWalkInCustomerForm';

vi.mock('../../../../auth/customer/api/customerAuth.api', () => ({
  signup: vi.fn(),
}));

vi.mock('../../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

function buildCustomer(overrides = {}) {
  return {
    id: 'customer-1',
    full_name: 'Existing Customer',
    contact_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'walkin@example.com',
    primary_auth_provider: 'email' as const,
    facebook_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('NewWalkInCustomerForm', () => {
  it('AC-2: creates a new customer when the email does not already exist', async () => {
    vi.mocked(listCustomers)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [buildCustomer()], error: null });
    vi.mocked(signup).mockResolvedValue({
      data: { message: 'ok' },
      error: null,
    });
    vi.mocked(updateCustomerProfile).mockResolvedValue({
      data: buildCustomer(),
      error: null,
    });
    const onSaved = vi.fn();

    render(
      createElement(NewWalkInCustomerForm, { accessToken: 'token', onSaved })
    );

    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'New Walkin' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'walkin@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check account/i }));

    expect(
      await screen.findByText(
        'No existing account found. Confirm to create a new customer.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create customer/i }));

    await vi.waitFor(() => expect(signup).toHaveBeenCalled());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('AC-3: shows and updates the existing record when the email already exists', async () => {
    const existing = buildCustomer();
    vi.mocked(listCustomers).mockResolvedValue({
      data: [existing],
      error: null,
    });
    vi.mocked(updateCustomerProfile).mockResolvedValue({
      data: { ...existing, full_name: 'Updated Walkin' },
      error: null,
    });
    const onSaved = vi.fn();

    render(
      createElement(NewWalkInCustomerForm, { accessToken: 'token', onSaved })
    );

    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Existing Customer' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'walkin@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check account/i }));

    expect(
      await screen.findByText(
        'An account already exists for this email. Confirm to update it instead of creating a duplicate.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /update customer/i }));

    await vi.waitFor(() =>
      expect(updateCustomerProfile).toHaveBeenCalledWith(
        'customer-1',
        'token',
        expect.any(Object)
      )
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(signup).not.toHaveBeenCalled();
  });
});
