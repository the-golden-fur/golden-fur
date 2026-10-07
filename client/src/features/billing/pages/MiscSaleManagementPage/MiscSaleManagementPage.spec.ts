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
import type { MiscSalePreview, Transaction } from '../../billing.types';
import { MiscSaleManagementPage } from './MiscSaleManagementPage';
import { NewMiscSalePage } from '../NewMiscSalePage/NewMiscSalePage';

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
  previewMiscSale: vi.fn(),
  getMiscSaleOptions: vi.fn(),
  getMiscSaleCredit: vi.fn(),
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

function buildPreview(
  overrides: Partial<MiscSalePreview> = {}
): MiscSalePreview {
  return {
    itemLines: [
      {
        line_item_type: 'misc_sale_item',
        reference_id: null,
        description: 'Cat toy',
        quantity: 1,
        unit_price: 80,
        line_total: 80,
      },
    ],
    discountLines: [],
    promoLines: [],
    subtotal: 80,
    discountAmount: 0,
    promoAmount: 0,
    preCreditTotal: 80,
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
            path: '/staff/admin/misc-sales/new',
            element: createElement(NewMiscSalePage),
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
    vi.mocked(billingApi.previewMiscSale).mockResolvedValue({
      data: buildPreview(),
      error: null,
    });
    vi.mocked(billingApi.getMiscSaleCredit).mockResolvedValue({
      data: { available: 0 },
      error: null,
    });
    vi.mocked(billingApi.getMiscSaleOptions).mockResolvedValue({
      data: {
        discounts: [
          {
            id: 'discount-1',
            name: 'Loyal Customer',
            discount_type: 'Percentage',
            value: 10,
            is_mandated: false,
          },
        ],
        promos: [
          {
            id: 'promo-1',
            name: 'Weekend Treats',
            discount_type: 'Flat',
            value: 20,
            end_date: null,
          },
        ],
      },
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

  it("Admin can edit a sale's payment method via the Edit modal", async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(billingApi.updateMiscSale).mockResolvedValue({
      data: {
        transaction: buildSale({ payment_method: 'GCash' }),
        lineItems: [],
        changeAmount: null,
      },
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit payment method' });
    await user.selectOptions(within(dialog).getByLabelText('Method'), 'GCash');
    await user.type(
      within(dialog).getByLabelText('Reference number'),
      'GC-123'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(billingApi.updateMiscSale).toHaveBeenCalledWith(
        'txn-1',
        {
          payment_method: 'GCash',
          bank_name: undefined,
          payment_reference: 'GC-123',
        },
        'token'
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  it('records a new misc sale via the New Misc Sale wizard', async () => {
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
        lineItems: [
          {
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
        ],
        changeAmount: 0,
      },
      error: null,
    });

    const newSale = buildSale({
      id: 'txn-2',
      misc_sale_description: 'Cat toy',
      total_amount: 80,
    });

    renderPage();

    await screen.findByText('Dog leash');
    // The list refetches on return, now including the new sale.
    vi.mocked(billingApi.listMiscSales).mockResolvedValue({
      data: [newSale, buildSale()],
      error: null,
    });
    await user.click(screen.getByRole('button', { name: 'New Misc Sale' }));

    // A full page now, not a dialog.
    expect(
      await screen.findByRole('heading', { name: 'New Miscellaneous Sale' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Step 1: Customer.
    await user.click(
      await screen.findByRole('button', { name: /Ada Lovelace/ })
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: Products - a single freetext row. Adding another row is
    // blocked until this one is filled in.
    const addItem = screen.getByRole('button', { name: 'Add another item' });
    expect(addItem).toBeDisabled();
    await user.type(
      screen.getByPlaceholderText('Search products or type a custom item...'),
      'Cat toy'
    );
    await user.type(screen.getByLabelText('Amount (PHP)'), '80');
    expect(addItem).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3: Discount/Promo - lists what the admin configured; the
    // cashier's pick is sent with the live preview.
    expect(
      await screen.findByRole('checkbox', { name: /Weekend Treats/ })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Loyal Customer/ }));
    await waitFor(() =>
      expect(billingApi.previewMiscSale).toHaveBeenLastCalledWith(
        expect.objectContaining({
          discount_ids: ['discount-1'],
          promo_ids: [],
        }),
        'token'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 4: Payment - Credit is always listed, but not selectable when
    // the customer's balance (0 here) doesn't cover the sale.
    expect(
      screen.getByRole('option', { name: /Credit \(.*available\)/ })
    ).toBeDisabled();
    expect(
      screen.getByText(/Credit can.t pay for this sale/)
    ).toBeInTheDocument();
    // Cash is the default, just needs a tendered amount.
    await user.type(screen.getByLabelText('Cash tendered (PHP)'), '80');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 5: Confirmation.
    await screen.findByText('Amount due');
    await user.click(
      screen.getByRole('button', { name: 'Confirm & record sale' })
    );

    await waitFor(() =>
      expect(billingApi.createMiscSale).toHaveBeenCalledWith(
        {
          customer_id: 'customer-1',
          items: [{ description: 'Cat toy', amount: 80 }],
          discount_ids: ['discount-1'],
          promo_ids: [],
          credit_to_apply: 0,
          payment_method: 'Cash',
          cash_tendered: 80,
        },
        'token'
      )
    );

    expect(await screen.findByText(/Sale recorded/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Record another sale' })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Back to Miscellaneous Sales' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Miscellaneous Sales' })
    ).toBeInTheDocument();
    expect(await screen.findByText('Cat toy')).toBeInTheDocument();
  });

  it('pays a misc sale entirely from credit when the balance covers it', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Cashier')],
      error: null,
    });
    vi.mocked(billingApi.getMiscSaleCredit).mockResolvedValue({
      data: { available: 500 },
      error: null,
    });
    vi.mocked(billingApi.createMiscSale).mockResolvedValue({
      data: {
        transaction: buildSale({
          id: 'txn-3',
          payment_method: 'Credit' as never,
          total_amount: 0,
        }),
        lineItems: [],
        changeAmount: null,
      },
      error: null,
    });

    renderPage();

    await screen.findByText('Dog leash');
    await user.click(screen.getByRole('button', { name: 'New Misc Sale' }));

    await user.click(
      await screen.findByRole('button', { name: /Ada Lovelace/ })
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(
      screen.getByPlaceholderText('Search products or type a custom item...'),
      'Cat toy'
    );
    await user.type(screen.getByLabelText('Amount (PHP)'), '80');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('checkbox', { name: /Loyal Customer/ });
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const creditOption = await screen.findByRole('option', {
      name: /Credit \(.*available\)/,
    });
    await waitFor(() => expect(creditOption).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Method'), 'Credit');
    expect(
      screen.queryByLabelText('Cash tendered (PHP)')
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('Amount due');
    await user.click(
      screen.getByRole('button', { name: 'Confirm & record sale' })
    );

    await waitFor(() =>
      expect(billingApi.createMiscSale).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: 'customer-1',
          payment_method: 'Credit',
          credit_to_apply: 0,
        }),
        'token'
      )
    );
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
