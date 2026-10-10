import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bookingApi from '../../../booking/api/booking.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as veterinaryApi from '../../api/veterinary.api';
import type { Service } from '../../../maintenance/maintenance.types';
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

// SlotPicker has its own spec covering availability fetching - stubbed here
// to a simple one-click selection so
// this file can focus on ScheduleFollowUpModal's own orchestration (locked
// context, the fixed service, reason, createBooking + linkFollowUpBooking).
vi.mock('../../../booking/components/SlotPicker/SlotPicker', () => ({
  SlotPicker: (props: {
    slotDurationMinutes: number;
    onSelect: (slot: { start: string; end: string }) => void;
  }) =>
    createElement(
      'button',
      {
        onClick: () =>
          props.onSelect({
            start: '2026-08-01T02:00:00.000Z',
            end: '2026-08-01T02:45:00.000Z',
          }),
      },
      `Pick mock slot (${props.slotDurationMinutes} min)`
    ),
}));
function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'service-followup',
    category: 'Veterinary',
    name: 'Follow-up Consultation',
    base_price: 0,
    duration_minutes: 45,
    is_active: true,
    requires_assessed_pet: true,
    captures_pet_assessment: false,
    min_nights_for_free_package: null,
    free_package_name: null,
    use_pricing_matrix: false,
    first_hour_fee: null,
    succeeding_hour_fee: null,
    daycare_overnight_fee: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Service;
}

function stubCatalogAndBranches(
  services: Service[] = [
    buildService({
      id: 'service-consult',
      name: 'Consultation',
      base_price: 700,
    }),
    buildService(),
  ]
) {
  vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
    data: [{ id: 'branch-makati', name: 'Makati', is_vet_branch: true }],
    error: null,
  } as never);
  vi.mocked(bookingApi.getBookingCatalog).mockResolvedValue({
    data: { services, packages: [], promos: [] },
    error: null,
  } as never);
}

function renderModal(flow: { stepLabel?: string; onBack?: () => void } = {}) {
  const onClose = vi.fn();
  const onLinked = vi.fn();

  render(
    createElement(ScheduleFollowUpModal, {
      accessToken: 'token',
      consultationId: 'consultation-1',
      petId: 'pet-1',
      petName: 'Whiskers',
      customerId: 'customer-1',
      ownerName: 'Jane Doe',
      branchId: 'branch-makati',
      veterinarianId: 'vet-1',
      onClose,
      onLinked,
      ...flow,
    })
  );

  return { onClose, onLinked };
}

const reasonBox = () => screen.getByLabelText('Reason for follow-up');
const confirmButton = () =>
  screen.getByRole('button', { name: 'Schedule follow-up' });
const pickSlot = async () =>
  userEvent.click(
    await screen.findByRole('button', { name: /Pick mock slot/ })
  );

describe('ScheduleFollowUpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows who it is for and that it books the free Follow-up Consultation - there is no service to choose', async () => {
    stubCatalogAndBranches();
    renderModal();

    expect(screen.getByText('Whiskers')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(
      await screen.findByText('Follow-up Consultation (₱0.00)')
    ).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    // The slot is sized to the service's own duration.
    expect(
      await screen.findByRole('button', { name: 'Pick mock slot (45 min)' })
    ).toBeInTheDocument();
  });

  it('cannot be confirmed without both a time and a reason', async () => {
    stubCatalogAndBranches();
    renderModal();
    await screen.findByText('Follow-up Consultation (₱0.00)');

    expect(confirmButton()).toBeDisabled();

    await pickSlot();
    expect(confirmButton()).toBeDisabled();

    await userEvent.type(reasonBox(), '   ');
    expect(confirmButton()).toBeDisabled();

    await userEvent.type(reasonBox(), 'Recheck the ear');
    expect(confirmButton()).toBeEnabled();
  });

  it('books the follow-up for the same pet with the scheduling vet and the reason, links it to the visit, and closes', async () => {
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

    const { onLinked, onClose } = renderModal();
    await screen.findByText('Follow-up Consultation (₱0.00)');

    await pickSlot();
    await userEvent.type(reasonBox(), '  Recheck the ear  ');
    await userEvent.click(confirmButton());

    expect(bookingApi.createBooking).toHaveBeenCalledWith('token', {
      customer_id: 'customer-1',
      pet_id: 'pet-1',
      branch_id: 'branch-makati',
      service_category: 'Veterinary',
      items: [{ service_id: 'service-followup' }],
      scheduled_start: '2026-08-01T02:00:00.000Z',
      scheduled_end: '2026-08-01T02:45:00.000Z',
      staff_preference: { type: 'specific', staff_id: 'vet-1' },
      special_instructions: 'Recheck the ear',
    });
    expect(veterinaryApi.linkFollowUpBooking).toHaveBeenCalledWith(
      'consultation-1',
      'token',
      { booking_id: 'booking-2', reason: 'Recheck the ear' }
    );
    expect(onLinked).toHaveBeenCalledWith({ id: 'consultation-1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('always books the follow-up with the vet scheduling it - no staff picker', async () => {
    stubCatalogAndBranches();
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: { id: 'booking-2' } as never,
      error: null,
    });
    vi.mocked(veterinaryApi.linkFollowUpBooking).mockResolvedValue({
      data: { consultation: {} as never, booking: {} as never },
      error: null,
    });

    renderModal();
    await screen.findByText('Follow-up Consultation (₱0.00)');
    expect(screen.getByText('Veterinarian')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();

    await pickSlot();
    await userEvent.type(reasonBox(), 'Recheck the ear');
    await userEvent.click(confirmButton());

    expect(bookingApi.createBooking).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        staff_preference: { type: 'specific', staff_id: 'vet-1' },
      })
    );
  });

  it('shows the error and stays open when the booking cannot be made', async () => {
    stubCatalogAndBranches();
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: null,
      error: 'No capacity for that slot.',
    });

    const { onClose } = renderModal();
    await screen.findByText('Follow-up Consultation (₱0.00)');

    await pickSlot();
    await userEvent.type(reasonBox(), 'Recheck the ear');
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No capacity for that slot.'
    );
    expect(veterinaryApi.linkFollowUpBooking).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not book a second time when only the linking failed - retrying links the booking already made', async () => {
    stubCatalogAndBranches();
    vi.mocked(bookingApi.createBooking).mockResolvedValue({
      data: { id: 'booking-2' } as never,
      error: null,
    });
    vi.mocked(veterinaryApi.linkFollowUpBooking)
      .mockResolvedValueOnce({ data: null, error: 'Server hiccup' })
      .mockResolvedValueOnce({
        data: {
          consultation: { id: 'consultation-1' } as never,
          booking: { id: 'booking-2' } as never,
        },
        error: null,
      });

    const { onClose } = renderModal();
    await screen.findByText('Follow-up Consultation (₱0.00)');

    await pickSlot();
    await userEvent.type(reasonBox(), 'Recheck the ear');
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Server hiccup');
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(confirmButton());

    expect(bookingApi.createBooking).toHaveBeenCalledTimes(1);
    expect(veterinaryApi.linkFollowUpBooking).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when the Follow-up Consultation service is not offered at this branch', async () => {
    stubCatalogAndBranches([
      buildService({ id: 'service-consult', name: 'Consultation' }),
    ]);
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Follow-up Consultation/
    );
    expect(confirmButton()).toBeDisabled();
  });

  it('Cancel closes without booking anything', async () => {
    stubCatalogAndBranches();
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(bookingApi.createBooking).not.toHaveBeenCalled();
  });

  it('as a step of the after-visit flow it is titled with the step, offers Back, and Cancel reads Skip', async () => {
    stubCatalogAndBranches();
    const onBack = vi.fn();
    const { onClose } = renderModal({ stepLabel: 'Step 2 of 2', onBack });

    expect(
      screen.getByRole('dialog', {
        name: 'Step 2 of 2: Follow-up consultation',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalled();
    expect(bookingApi.createBooking).not.toHaveBeenCalled();
  });

  it('opened on its own it has no Back and no step in its title', async () => {
    stubCatalogAndBranches();
    renderModal();

    expect(
      screen.getByRole('dialog', { name: 'Schedule follow-up' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });
});
