import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as customerApi from '../../../customers/api/customer.api';
import type { CustomerProfile } from '../../../customers/customer.types';
import * as catalogApi from '../../../catalog/api/catalog.api';
import * as billingApi from '../../../billing/api/billing.api';
import type { Transaction } from '../../billing.types';
import { MiscSaleManagementPage } from './MiscSaleManagementPage';

vi.mock('../../../staff/api/staff.api', () => ({ listStaff: vi.fn() }));
vi.mock('../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
}));
vi.mock('../../../catalog/api/catalog.api', () => ({ listProducts: vi.fn() }));
vi.mock('../../api/billing.api', () => ({
  listMiscSales: vi.fn(),
  createMiscSale: vi.fn(),
  updateMiscSale: vi.fn(),
  deleteMiscSale: vi.fn(),
}));

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'staff1',
    registered_email: 'staff1@example.com',
    display_name: 'Staff One',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function buildCustomer(
  overrides: Partial<CustomerProfile> = {}
): CustomerProfile {
  return {
    id: 'customer-1',
    full_name: 'Ada Lovelace',
    contact_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'ada@example.com',
    primary_auth_provider: 'email',
    facebook_id: null,
    profile_photo_url: null,
    is_active: true,
    archived_at: null,
    deactivated_at: null,
    anonymized_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildSale(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    booking_id: null,
    booking_group_id: null,
    customer_id: 'customer-1',
    branch_id: 'branch-makati',
    transaction_type: 'miscellaneous_sale',
    payment_method: 'Cash',
    bank_name: null,
    payment_status: 'Fully Paid',
    subtotal_amount: 250,
    discount_amount: 0,
    promo_amount: 0,
    credit_applied_amount: 0,
    total_amount: 250,
    payment_reference: null,
    misc_sale_description: 'Dog leash',
    processed_by_staff_id: 'staff-1',
    payment_choice: null,
    created_at: '2026-09-14T00:00:00.000Z',
    updated_at: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/misc-sales'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/misc-sales',
            element: createElement(MiscSaleManagementPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: 'Settings page',
          }),
          createElement(Route, {
            path: '/staff/reports/transaction-history',
            element: 'Transactions page',
          })
        )
      )
    )
  );
}

describe('MiscSaleManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.listCustomers).mockResolvedValue({
      data: [buildCustomer()],
      error: null,
    });
    vi.mocked(catalogApi.listProducts).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(billingApi.listMiscSales).mockResolvedValue({
      data: [buildSale()],
      error: null,
    });
  });

  it('redirects a role that cannot record misc sales', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Settings page')).toBeInTheDocument();
  });

  it('Cashier sees the list with no Edit/Delete, plus a New Misc Sale button', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Dog leash')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New Misc Sale' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  it('Admin sees Edit/Delete and can delete a sale', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(billingApi.deleteMiscSale).mockResolvedValue({
      data: null,
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(billingApi.deleteMiscSale).toHaveBeenCalledWith('txn-1', 'token');
    await waitFor(() =>
      expect(screen.queryByText('Dog leash')).not.toBeInTheDocument()
    );
  });

  it('Admin can edit a sale inline via Save/Cancel', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(billingApi.updateMiscSale).mockResolvedValue({
      data: {
        transaction: buildSale({ misc_sale_description: 'Cat leash' }),
        lineItem: {
          id: 'line-1',
          transaction_id: 'txn-1',
          line_item_type: 'misc_sale_item',
          reference_id: null,
          description: 'Cat leash',
          quantity: 1,
          unit_price: 250,
          line_total: 250,
          created_at: '2026-09-14T00:00:00.000Z',
        },
        changeAmount: null,
      },
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const descriptionInput = screen.getByDisplayValue('Dog leash');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Cat leash');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(billingApi.updateMiscSale).toHaveBeenCalledWith(
        'txn-1',
        { description: 'Cat leash', amount: 250 },
        'token'
      )
    );
    expect(await screen.findByText('Cat leash')).toBeInTheDocument();
  });

  it('every viewer role gets a "View in Transactions" link that navigates there', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: /Options for/ }));
    await user.click(
      screen.getByRole('menuitem', { name: 'View in Transactions' })
    );

    expect(await screen.findByText('Transactions page')).toBeInTheDocument();
  });

  it('records a new misc sale via the New Misc Sale modal', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(billingApi.createMiscSale).mockResolvedValue({
      data: {
        transaction: buildSale({
          id: 'txn-2',
          misc_sale_description: 'Cat toy',
          total_amount: 80,
        }),
        lineItem: {
          id: 'line-2',
          transaction_id: 'txn-2',
          line_item_type: 'misc_sale_item',
          reference_id: null,
          description: 'Cat toy',
          quantity: 1,
          unit_price: 80,
          line_total: 80,
          created_at: '2026-09-14T00:00:00.000Z',
        },
        changeAmount: null,
      },
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: 'New Misc Sale' }));

    const dialog = screen.getByRole('dialog', {
      name: 'New Miscellaneous Sale',
    });
    await user.click(
      within(dialog).getByRole('button', { name: /Ada Lovelace/ })
    );
    await user.type(
      within(dialog).getByPlaceholderText(
        'Search products or type a custom item...'
      ),
      'Cat toy'
    );
    await user.type(within(dialog).getByLabelText('Amount (PHP)'), '80');
    await user.click(
      within(dialog).getByRole('button', { name: 'Record sale' })
    );

    await waitFor(() =>
      expect(billingApi.createMiscSale).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: 'customer-1',
          description: 'Cat toy',
          amount: 80,
        }),
        'token'
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Cat toy')).toBeInTheDocument();
  });

  it('searching narrows the visible sales by description', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(billingApi.listMiscSales).mockResolvedValue({
      data: [
        buildSale({ id: '1', misc_sale_description: 'Dog leash' }),
        buildSale({ id: '2', misc_sale_description: 'Cat toy' }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    expect(screen.getByText('Cat toy')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText('Search by description, method, status...'),
      'dog'
    );

    expect(screen.getByText('Dog leash')).toBeInTheDocument();
    expect(screen.queryByText('Cat toy')).not.toBeInTheDocument();
  });

  it('switches to Board view, grouped by Status by default', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(screen.getByText('Fully Paid')).toBeInTheDocument();
    expect(screen.getByText('Dog leash')).toBeInTheDocument();
  });
});
