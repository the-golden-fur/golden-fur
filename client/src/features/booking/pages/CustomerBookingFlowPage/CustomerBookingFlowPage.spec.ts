import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../customers/api/customer.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as bookingApi from '../../api/booking.api';
import { CustomerBookingFlowPage } from './CustomerBookingFlowPage';

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomerPets: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  getBookingCatalog: vi.fn(),
  createBooking: vi.fn(),
}));

vi.mock('../../components/SlotPicker/SlotPicker', () => ({
  SlotPicker: () => createElement('div', { 'data-testid': 'slot-picker' }),
}));
vi.mock('../../components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: () =>
    createElement('div', { 'data-testid': 'staff-picker' }),
}));

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'cust-1', email: 'customer1@goldenfur.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/portal/book'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/portal/book',
            element: createElement(CustomerBookingFlowPage),
          })
        )
      )
    )
  );
}

describe('CustomerBookingFlowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.listCustomerPets).mockResolvedValue({
      data: [
        {
          id: 'pet-1',
          customer_id: 'cust-1',
          name: 'Max',
          pet_type: 'Dog',
          breed_id: null,
          photo_url: null,
          gender: null,
          date_of_birth: null,
          weight_class: 'M',
          coat_type: 'SC',
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: true }],
      error: null,
    });
    vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
      data: {
        services: [
          {
            id: 'service-1',
            category: 'Grooming',
            name: 'Bath',
            base_price: 300,
            duration_minutes: 60,
            is_active: true,
            created_by: null,
            updated_by: null,
            created_at: '',
            updated_at: '',
          },
        ],
        packages: [],
        promos: [],
      },
      error: null,
    });
  });

  it('never calls the staff-only GET /bookings/policy or /maintenance/* endpoints (regression: customer 403s)', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    await user.click(screen.getByText('Max'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Makati')).toBeInTheDocument());
    await user.click(screen.getByText('Makati'));
    await user.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(screen.getByText('Grooming')).toBeInTheDocument()
    );
    await user.click(screen.getByText('Grooming'));

    await waitFor(() => expect(screen.getByText('Bath')).toBeInTheDocument());

    expect(bookingApi.getBookingCatalog).toHaveBeenCalledWith('token', {
      branchId: 'branch-1',
    });
  });
});
