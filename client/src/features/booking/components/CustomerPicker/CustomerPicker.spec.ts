import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { listCustomers } from '../../../customers/api/customer.api';
import type { CustomerProfile } from '../../../customers/customer.types';
import { CustomerPicker } from './CustomerPicker';

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
}));

const CUSTOMERS: CustomerProfile[] = [
  {
    id: 'cust-1',
    full_name: 'Ana Cruz',
    contact_number: '+63 917 000 0001',
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: 'Call',
    account_email: 'ana@example.com',
    primary_auth_provider: 'email',
    facebook_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'cust-2',
    full_name: 'Ben Reyes',
    contact_number: '+63 917 000 0002',
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: 'Text',
    account_email: 'ben@example.com',
    primary_auth_provider: 'email',
    facebook_id: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
  },
];

describe('CustomerPicker', () => {
  it('renders each existing customer as a selectable card, not an editable form', async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: CUSTOMERS,
      error: null,
    });

    render(
      createElement(CustomerPicker, { accessToken: 'token', onSelect: vi.fn() })
    );

    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
    expect(screen.getByText('Ben Reyes')).toBeInTheDocument();
    // No name/email inputs anywhere - this is a picker, not the
    // create-or-update form.
    expect(screen.queryByPlaceholderText(/full name/i)).not.toBeInTheDocument();
  });

  it('clicking a card calls onSelect with that customer, without any update/PATCH side effect', async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: CUSTOMERS,
      error: null,
    });
    const onSelect = vi.fn();

    render(createElement(CustomerPicker, { accessToken: 'token', onSelect }));

    fireEvent.click(await screen.findByText('Ana Cruz'));

    expect(onSelect).toHaveBeenCalledWith(CUSTOMERS[0]);
  });

  it('search filters by name, email, or phone', async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: CUSTOMERS,
      error: null,
    });

    render(
      createElement(CustomerPicker, { accessToken: 'token', onSelect: vi.fn() })
    );

    await screen.findByText('Ana Cruz');

    fireEvent.change(
      screen.getByPlaceholderText('Search by name, email, or phone...'),
      { target: { value: 'ben@example' } }
    );

    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Ben Reyes')).toBeInTheDocument();
  });

  it('filters by preferred communication channel', async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: CUSTOMERS,
      error: null,
    });

    render(
      createElement(CustomerPicker, { accessToken: 'token', onSelect: vi.fn() })
    );

    await screen.findByText('Ana Cruz');

    fireEvent.change(screen.getByDisplayValue('All communication channels'), {
      target: { value: 'Text' },
    });

    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Ben Reyes')).toBeInTheDocument();
  });

  it('links out to Customer Management for creating a new customer, rather than embedding creation here', async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: CUSTOMERS,
      error: null,
    });

    render(
      createElement(CustomerPicker, { accessToken: 'token', onSelect: vi.fn() })
    );

    await screen.findByText('Ana Cruz');

    const link = screen.getByText(/create a new customer/i);
    expect(link.closest('a')).toHaveAttribute('href', '/staff/admin/customers');
  });

  it('shows an empty-search state instead of an error when nothing matches', async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: CUSTOMERS,
      error: null,
    });

    render(
      createElement(CustomerPicker, { accessToken: 'token', onSelect: vi.fn() })
    );

    await screen.findByText('Ana Cruz');

    fireEvent.change(
      screen.getByPlaceholderText('Search by name, email, or phone...'),
      { target: { value: 'nobody-matches-this' } }
    );

    expect(
      await screen.findByText('No customers match your search.')
    ).toBeInTheDocument();
  });
});
