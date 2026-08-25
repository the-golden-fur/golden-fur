import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bookingApi from '../../../booking/api/booking.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as veterinaryApi from '../../api/veterinary.api';
import type { Package, Service } from '../../../maintenance/maintenance.types';
import { ScheduleFollowUpModal } from './ScheduleFollowUpModal';

vi.mock('../../../booking/api/booking.api', () => ({
  createBooking: vi.fn(),
  getBookingCatalog: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));
vi.mock('../../api/veterinary.api', () => ({
  linkFollowUpBooking: vi.fn(),
}));

// SlotPicker/StaffPickerList have their own specs covering availability/
// staff-assignment fetching - stubbed here to simple one-click selections so
// this file can focus on ScheduleFollowUpModal's own orchestration (locked
// context, item selection, createBooking + linkFollowUpBooking, redirect).
vi.mock('../../../booking/components/SlotPicker/SlotPicker', () => ({
  SlotPicker: (props: {
    onSelect: (slot: { start: string; end: string }) => void;
  }) =>
    createElement(
      'button',
      {
        onClick: () =>
          props.onSelect({
            start: '2026-08-01T02:00:00.000Z',
            end: '2026-08-01T03:00:00.000Z',
          }),
      },
      'Pick mock slot'
    ),
}));
vi.mock('../../../booking/components/StaffPickerList/StaffPickerList', () => ({
  StaffPickerList: (props: {
    onSelect: (preference: { type: 'no_preference' }) => void;
  }) =>
    createElement(
      'button',
      { onClick: () => props.onSelect({ type: 'no_preference' }) },
      'Pick mock staff'
    ),
}));

function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'service-1',
    category: 'Veterinary',
    name: 'Wellness Exam',
    base_price: 500,
    duration_minutes: 30,
    is_active: true,
    requires_assessed_pet: false,
    captures_pet_assessment: false,
    min_nights_for_free_package: null,
    free_package_name: null,
    use_pricing_matrix: false,
    first_hour_fee: null,
    succeeding_hour_fee: null,
    daycare_overnight_fee: null,
    requires_downpayment: false,
    downpayment_amount: null,
    downpayment_type: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'package-1',
    name: 'Wellness Bundle',
    bundled_price: 1200,
    total_duration_minutes: 90,
    use_pricing_matrix: false,
    requires_downpayment: false,
    downpayment_amount: null,
    downpayment_type: null,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    archived_at: null,
    ...overrides,
  };
}

/** The catalog endpoint's own `packages` array isn't category-scoped (a
 * package can bundle services across categories) - includes one here by
 * default so tests catch the modal ever offering it. */
function stubCatalogAndBranches() {
  vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
    data: [{ id: 'branch-makati', name: 'Makati', is_vet_branch: true }],
    error: null,
  });
  vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
    data: { services: [buildService()], packages: [buildPackage()], promos: [] },
    error: null,
  });
}

function renderModal(overrides: Partial<Parameters<typeof ScheduleFollowUpModal>[0]> = {}) {
  const onClose = vi.fn();
  const onLinked = vi.fn();

  render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/veterinary/console'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/staff/veterinary/console',
          element: createElement(ScheduleFollowUpModal, {
            accessToken: 'token',
            consultationId: 'consultation-1',
            petId: 'pet-1',
            petName: 'Whiskers',
            customerId: 'customer-1',
            ownerName: 'Jane Doe',
            branchId: 'branch-makati',
            originalSpecialInstructions: null,
            onClose,
            onLinked,
            ...overrides,
          }),
        }),
        createElement(Route, {
          path: '/staff/bookings/:bookingId',
          element: createElement('div', null, 'Booking receipt page'),
        })
      )
    )
  );

  return { onClose, onLinked };
}

describe('ScheduleFollowUpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('locks pet/owner/branch/category and requires a service + slot before Confirm is enabled', async () => {
    stubCatalogAndBranches();
    renderModal();

    expect(screen.getByText('Pet')).toBeInTheDocument();
    expect(screen.getByText('Whiskers')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('Veterinary')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

    // Only the Veterinary service shows up - the catalog's own (non-category-
    // scoped) package is never offered as a choosable option.
    expect(
      screen.getByRole('option', { name: /Wellness Exam/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Wellness Bundle/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Service / Package')).not.toBeInTheDocument();
  });

  it('creates the booking with the locked context + chosen item/slot, links it to the consultation, and redirects to the receipt page', async () => {
    stubCatalogAndBranches();
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: { id: 'booking-2', status: 'Pending' } as never,
      error: null,
    });
    vi.mocked(veterinaryApi.linkFollowUpBooking).mockResolvedValue({
      data: {
        consultation: { id: 'consultation-1' } as never,
        booking: { id: 'booking-2' } as never,
      },
      error: null,
    });

    const { onLinked } = renderModal();
    const user = userEvent.setup();

    const serviceSelect = await screen.findByRole('combobox');
    await user.selectOptions(serviceSelect, 'service-1');
    await user.click(screen.getByRole('button', { name: 'Pick mock slot' }));
    await user.click(screen.getByRole('button', { name: 'Pick mock staff' }));

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(bookingApi.createBooking).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        customer_id: 'customer-1',
        pet_id: 'pet-1',
        branch_id: 'branch-makati',
        service_category: 'Veterinary',
        items: [{ service_id: 'service-1' }],
        scheduled_start: '2026-08-01T02:00:00.000Z',
        staff_preference: { type: 'no_preference' },
      })
    );
    expect(veterinaryApi.linkFollowUpBooking).toHaveBeenCalledWith(
      'consultation-1',
      'token',
      'booking-2'
    );
    expect(onLinked).toHaveBeenCalledWith({ id: 'consultation-1' });
    expect(await screen.findByText('Booking receipt page')).toBeInTheDocument();
  });

  it('shows an error and stays open when booking creation fails', async () => {
    stubCatalogAndBranches();
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: null,
      error: 'No capacity for that slot.',
    });

    renderModal();
    const user = userEvent.setup();

    const serviceSelect = await screen.findByRole('combobox');
    await user.selectOptions(serviceSelect, 'service-1');
    await user.click(screen.getByRole('button', { name: 'Pick mock slot' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText('No capacity for that slot.')
    ).toBeInTheDocument();
    expect(veterinaryApi.linkFollowUpBooking).not.toHaveBeenCalled();
  });

  it('Cancel closes the modal without creating a booking', async () => {
    stubCatalogAndBranches();
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(bookingApi.createBooking).not.toHaveBeenCalled();
  });
});
