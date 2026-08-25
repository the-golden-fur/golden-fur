import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as customerApi from '../../../customers/api/customer.api';
import * as veterinaryApi from '../../api/veterinary.api';
import type { StaffProfile } from '../../../staff/staff.types';
import type { BookingStatus } from '../../../booking/booking.types';
import type { Consultation } from '../../veterinary.types';
import { VeterinaryConsolePage } from './VeterinaryConsolePage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
  getPetHealthConditions: vi.fn(),
}));
vi.mock('../../api/veterinary.api', () => ({
  listConsultationQueue: vi.fn(),
  updateConsultation: vi.fn(),
  linkFollowUpBooking: vi.fn(),
  getPetConsultationHistory: vi.fn(),
  upsertPetHealthConditions: vi.fn(),
  listMedicationCatalog: vi.fn().mockResolvedValue({ data: [], error: null }),
  listProcedureCatalog: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

// ScheduleFollowUpModal has its own spec covering its internal flow
// (catalog/slot/staff picking, createBooking + linkFollowUpBooking,
// redirect) - here it's stubbed to a minimal, test-drivable stand-in so this
// file can focus on the console page's own responsibility: opening it with
// the right locked-in context and reacting to onLinked/onClose.
vi.mock('../../components/ScheduleFollowUpModal/ScheduleFollowUpModal', () => ({
  ScheduleFollowUpModal: (props: {
    consultationId: string;
    petName: string;
    ownerName: string;
    onClose: () => void;
    onLinked: (consultation: Consultation) => void;
  }) =>
    createElement(
      'div',
      { role: 'dialog', 'aria-label': 'Schedule Follow-up (mock)' },
      createElement('span', null, `Pet: ${props.petName}`),
      createElement('span', null, `Owner: ${props.ownerName}`),
      createElement(
        'button',
        {
          onClick: () =>
            props.onLinked({
              id: props.consultationId,
              booking_id: 'booking-1',
              pet_id: 'pet-1',
              veterinarian_id: 'vet-1',
              temperature: null,
              weight: null,
              heart_rate: null,
              respiratory_rate: null,
              diagnosis: null,
              medications: null,
              reason_for_visit: 'Annual checkup',
              follow_up_date: '2026-08-01',
              follow_up_booking_id: 'booking-2',
              created_at: '2026-07-19T00:00:00.000Z',
              updated_at: '2026-07-19T00:00:00.000Z',
            }),
        },
        'Confirm mock follow-up'
      ),
      createElement(
        'button',
        { onClick: props.onClose },
        'Cancel mock follow-up'
      )
    ),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'vet-1',
    branch_id: 'branch-makati',
    role,
    username: 'vet1',
    registered_email: 'vet1@example.com',
    display_name: 'Vet One',
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

// Booking-status revision: the consultation's execution state now lives on
// the joined booking's status, not a consultation-local field - overriding
// `bookingStatus` (rather than `status`) is how these tests move a built
// consultation between Pending/In Progress/Completed.
function buildConsultation(
  overrides: Partial<Consultation> = {},
  bookingStatus: BookingStatus = 'Pending'
): Consultation {
  return {
    id: 'consultation-1',
    booking_id: 'booking-1',
    pet_id: 'pet-1',
    veterinarian_id: 'vet-1',
    temperature: null,
    weight: null,
    heart_rate: null,
    respiratory_rate: null,
    diagnosis: null,
    medications: null,
    reason_for_visit: 'Annual checkup',
    follow_up_date: null,
    follow_up_booking_id: null,
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    booking: {
      id: 'booking-1',
      customer_id: 'customer-1',
      pet_id: 'pet-1',
      branch_id: 'branch-makati',
      created_by_staff_id: null,
      service_category: 'Veterinary',
      service_id: 'service-1',
      package_id: null,
      scheduled_start: '2026-07-19T02:00:00.000Z',
      scheduled_end: '2026-07-19T03:00:00.000Z',
      assigned_staff_id: 'vet-1',
      status: bookingStatus,
      total_price: 800,
      downpayment_amount: null,
      payment_method: null,
      payment_confirmed: true,
      special_instructions: null,
      hotel_preferences: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      reschedule_count: 0,
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    },
    ...overrides,
  };
}

function stubPetAndOwner() {
  vi.mocked(customerApi.getPet).mockResolvedValue({
    data: {
      id: 'pet-1',
      customer_id: 'customer-1',
      name: 'Whiskers',
      pet_type: 'Cat',
      breed_id: null,
      photo_url: null,
      gender: 'Female',
      date_of_birth: null,
      weight_class: 'S',
      coat_type: 'SC',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
  vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
    data: {
      id: 'customer-1',
      full_name: 'Jane Doe',
      contact_number: null,
      emergency_contact_name: null,
      emergency_contact_number: null,
      preferred_communication_channel: null,
      account_email: 'jane@example.com',
      primary_auth_provider: 'email',
      facebook_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'vet-1', email: 'vet1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/veterinary/console'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/veterinary/console',
            element: createElement(VeterinaryConsolePage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('VeterinaryConsolePage (#70)', () => {
  // Issue #78: HealthConditionsField mounts inside ConsultationDetailPanel
  // whenever a consultation is selected - defaulted here so tests that
  // select one (but don't care about health conditions) don't have to know
  // about this unrelated fetch.
  beforeEach(() => {
    vi.mocked(customerApi.getPetHealthConditions).mockResolvedValue({
      data: null,
      error: null,
    });
    vi.mocked(veterinaryApi.upsertPetHealthConditions).mockResolvedValue({
      data: null,
      error: null,
    });
  });

  it('AC-1: redirects a non-Veterinarian/Admin/Supervisor/Superadmin viewer to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-1: lists today’s consultations grouped by the joined booking status (Pending/In Progress)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ id: 'c-pending' }, 'Pending'),
          buildConsultation({ id: 'c-ongoing' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    const pendingRows = await screen.findAllByText('Whiskers');
    expect(pendingRows).toHaveLength(2);
    expect(
      screen.getByText('Pending', { selector: 'span' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('In Progress', { selector: 'span' })
    ).toBeInTheDocument();
  });

  it('starting a Pending consultation from its queue row also requires confirming in the shared modal', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'Pending')] },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'In Progress'),
      error: null,
    });

    renderPage();

    // Only the row's own quick-start button exists yet - nothing is
    // selected, so the detail panel isn't rendered at all.
    await userEvent.click(
      await screen.findByRole('button', { name: /^start consultation$/i })
    );

    const dialog = await screen.findByRole('dialog');
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /start consultation/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        { status: 'Ongoing' }
      )
    );
  });

  it('starting a Pending consultation from the detail panel requires confirming in a modal', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'Pending')] },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'In Progress'),
      error: null,
    });

    renderPage();

    await userEvent.click(await screen.findByText('Whiskers'));

    const startButtons = await screen.findAllByRole('button', {
      name: /^start consultation$/i,
    });
    // Both the row's quick-start button and the detail panel's trigger are
    // visible at this point - the panel's is the last one in document order
    // (queue renders before the detail pane).
    await userEvent.click(startButtons[startButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /start consultation/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        { status: 'Ongoing' }
      )
    );
  });

  it('AC-2: completing an In Progress consultation calls updateConsultation with status Completed', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [buildConsultation({}, 'In Progress')],
      },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'Completed'),
      error: null,
    });

    renderPage();

    await userEvent.click(await screen.findByText('Whiskers'));
    await userEvent.click(
      await screen.findByRole('button', { name: /complete consultation/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        expect.objectContaining({ status: 'Completed' })
      )
    );
  });

  it('AC-4: the "..." kebab opens ScheduleFollowUpModal locked to this pet/owner, and a successful follow-up shows the "Follow-up scheduled" indicator', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        // The queue endpoint only ever returns Pending/In Progress bookings
        // (STATUS_GROUPS), so the follow-up kebab - only reachable once the
        // booking is finished (FINISHED_BOOKING_STATUSES) - has to be reached
        // by actually completing the consultation below, not by seeding an
        // already-Completed row here.
        consultations: [buildConsultation({}, 'In Progress')],
      },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'Completed'),
      error: null,
    });

    renderPage();

    await userEvent.click(await screen.findByText('Whiskers'));
    await userEvent.click(
      await screen.findByRole('button', { name: /complete consultation/i })
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Options for Whiskers' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Schedule Follow-up' })
    );

    const modal = await screen.findByRole('dialog', {
      name: 'Schedule Follow-up (mock)',
    });
    expect(within(modal).getByText('Pet: Whiskers')).toBeInTheDocument();
    expect(within(modal).getByText('Owner: Jane Doe')).toBeInTheDocument();

    await userEvent.click(
      within(modal).getByRole('button', { name: 'Confirm mock follow-up' })
    );

    expect(await screen.findByText(/follow-up scheduled/i)).toBeInTheDocument();
  });

  it('View Details shows a read-only vet-only snapshot (vitals/diagnosis/medications), not the booking-side receipt', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation(
            {
              temperature: 38.5,
              weight: 12,
              heart_rate: 90,
              respiratory_rate: 20,
              diagnosis: 'Ear infection',
              medications: [
                { name: 'Amoxicillin', dose: '250mg', notes: 'Twice daily' },
              ],
            },
            'Completed'
          ),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Options for Whiskers' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View Details' })
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Consultation Details',
    });
    expect(within(dialog).getByText('38.5')).toBeInTheDocument();
    expect(within(dialog).getByText('Ear infection')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Amoxicillin — 250mg (Twice daily)')
    ).toBeInTheDocument();

    // Read-only - no editable form controls in this view, unlike selecting
    // the row (which opens ConsultationDetailPanel's input-based form).
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('AC-1: the status filter narrows the queue to just the selected booking status', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ id: 'c-pending' }, 'Pending'),
          buildConsultation({ id: 'c-ongoing' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    await screen.findAllByText('Whiskers');

    await userEvent.selectOptions(
      screen.getByLabelText('Status'),
      'In Progress'
    );

    expect(screen.queryByText('Pending', { selector: 'span' })).toBeNull();
    expect(
      screen.getByText('In Progress', { selector: 'span' })
    ).toBeInTheDocument();
  });
});
